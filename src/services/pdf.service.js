const supabase = require('../config/supabase');
const PDFDocument = require('pdfkit');
const { deletarPdfAntigo, adicionarTextoComNegrito } = require('../utils/pdfUtils');

async function gerarPdf(dados) {
  console.log('✅ REQUISIÇÃO DE GERAÇÃO DE PDF RECEBIDA');

  try {
    const { data: modelo, error } = await supabase
      .from('modelo_contrato')
      .select('texto_completo')
      .eq('titulo', 'Contrato Principal')
      .single();

    if (error || !modelo) {
      throw new Error('Modelo de contrato não encontrado');
    }

    let textoContrato = modelo.texto_completo;

    // Substituições principais
    const substituições = {
      nome_contratante: dados.nome_contratante || '',
      cpf_contratante: dados.cpf_contratante || '',
      residencia_contratante: dados.residencia_contratante || '',
      data_evento: dados.data_evento || '',
      hora_inicio: dados.hora_inicio || '',
      hora_fim: dados.hora_fim || '',
      duracao: dados.duracao || '',
      local_evento: dados.local_evento || '',
      tipo_evento: dados.tipo_evento || '',
      num_convidados: dados.num_convidados || '',
      preco_por_convidado: dados.preco_por_convidado || '',
      preco_total: dados.preco_total || '',
      clausula_pagamento: dados.clausula_texto || '',
      assinatura: dados.assinatura || ''
    };

    Object.keys(substituições).forEach(key => {
      textoContrato = textoContrato.replace(
        new RegExp(`\\{${key}\\}`, 'g'), 
        substituições[key]
      );
    });

    // Tratamento do cardápio
    let cardapioTexto = 'Nenhum item selecionado.';
    if (dados.cardapio_selecionado && Array.isArray(dados.cardapio_selecionado) && dados.cardapio_selecionado.length > 0) {
      cardapioTexto = dados.cardapio_selecionado.map(item => `**• ${item}**`).join('\n');
    }
    textoContrato = textoContrato.replace(/\{cardapio\}/g, cardapioTexto);

    textoContrato = textoContrato
    .replace(/\r/g, '')
    .replace(/\t/g, ' ')
    .replace(/[^\x20-\x7EÀ-ÿ•°ºª%\n]/g, '');

    const doc = new PDFDocument({ 
      size: 'A4', 
      margins: { top: 50, bottom: 50, left: 50, right: 50 } 
    });

    doc.fillColor('#000000');
    doc.strokeColor('black');

    let buffers = [];
    doc.on('data', buffers.push.bind(buffers));

    // Funções internas
    function adicionarMarcaDagua(currentDoc) {
      const pageWidth = currentDoc.page.width;
      const pageHeight = currentDoc.page.height;
      currentDoc.image('logo.png', pageWidth / 2 - 250, 50, { width: 500 });
      currentDoc.opacity(0.2);
      currentDoc.image('logo2.png', pageWidth / 2 - 75, pageHeight / 2 - 430, { width: 150 });
      currentDoc.image('logo3.png', pageWidth / 2 - 75, pageHeight - 120, { width: 150 });
      currentDoc.opacity(1);
    }

    function adicionarAssinatura(currentDoc) {
      if (dados.assinatura !== 'Digital') return;
      const pageWidth = currentDoc.page.width;
      const pageHeight = currentDoc.page.height;
      currentDoc.image('assinatura.png', pageWidth - 100, pageHeight - 80, { width: 60 });
    }

    adicionarMarcaDagua(doc);
    adicionarAssinatura(doc);

    doc.on('pageAdded', () => {
      adicionarMarcaDagua(doc);
      adicionarAssinatura(doc);
    });

    doc.fontSize(16).text('CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE BUFFET', { align: 'center' });
    doc.moveDown(2);
    //doc.fontSize(12).text(textoContrato, { align: 'justify' });

    doc.fontSize(12);

    await adicionarTextoComNegrito(
      doc,
      textoContrato,
      {
        width: 500,
        align: 'justify'
      }
    );

    // Assinatura final
    const alturaNecessaria = 140;

    // Se estiver perto do final da página, cria nova página
    if (doc.y + alturaNecessaria > doc.page.height - 50) {
      doc.addPage();
    }

    doc.moveDown(4);

    const yAssinatura = doc.y;

    // assinatura digital
    if (dados.assinatura === 'Digital') {
      doc.image(
        'assinatura.png',
        80,
        yAssinatura - 40,
        { width: 120 }
      );
    }

    // linhas assinatura
    doc.text(
      '_______________________                             _____________________',
      {
        align: 'center'
      }
    );

    doc.moveDown(0.5);

    // nomes assinatura
    doc.text(
      'CONTRATADA                                      CONTRATANTE',
      {
        align: 'center'
      }
    );

    doc.end();

    return new Promise((resolve, reject) => {
      doc.on('end', async () => {
        try {
          const pdfBuffer = Buffer.concat(buffers);
          const fileName = `contrato-${Date.now()}.pdf`;

          const { error: uploadError } = await supabase.storage
            .from('contratos')
            .upload(fileName, pdfBuffer, { 
              contentType: 'application/pdf', 
              upsert: true 
            });

          if (uploadError) throw uploadError;

          const { data: urlData } = supabase.storage.from('contratos').getPublicUrl(fileName);

          if (dados.id) {
            await supabase.from('contratos').update({ pdf_url: urlData.publicUrl }).eq('id', dados.id);
          }

          resolve({
            success: true,
            pdfUrl: urlData.publicUrl,
            message: 'PDF gerado com sucesso!'
          });
        } catch (err) {
          reject(err);
        }
      });
    });

  } catch (err) {
    console.error(err);
    throw new Error('Erro interno ao gerar PDF');
  }
}

module.exports = { gerarPdf };