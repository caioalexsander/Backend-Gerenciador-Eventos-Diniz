const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const PDFDocument = require('pdfkit');
//const path = require('path');
const app = express();
app.use(cors());
app.use(express.json());

require('dotenv').config();
// ====================== SUPABASE ======================
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ====================== ASSINATURA MANUAL ======================
app.put('/contratos/:id/assinatura-manual', async (req, res) => {
  const { id } = req.params;
  const { pdf_url } = req.body;

  try {
    console.log('📄 Assinatura manual - ID:', id);
    console.log('📄 Novo URL:', pdf_url);

    // Buscar contrato atual
    const { data: contrato, error: fetchError } = await supabase
      .from('contratos')
      .select('pdf_url')
      .eq('id', id)
      .single();

    if (fetchError || !contrato) {
      return res.status(404).json({ error: "Contrato não encontrado" });
    }

    const oldPdfUrl = contrato.pdf_url;
    const newPdfUrl = pdf_url;

    // Comparação
    let conteudoIgual = true;
    if (oldPdfUrl) {
      conteudoIgual = await compararPDFsComAssinatura(oldPdfUrl, newPdfUrl);
    }

    if (!conteudoIgual) {
      return res.status(409).json({
        warning: true,
        message: "O conteúdo do contrato foi alterado além da assinatura. Deseja prosseguir mesmo assim?"
      });
    }

    // Atualizar no banco
    const { error: updateError } = await supabase
      .from('contratos')
      .update({
        pdf_url: newPdfUrl,
        status_assinatura: "assinado"
      })
      .eq('id', id);

    if (updateError) throw updateError;

    // === DELETAR PDF ANTIGO ===
    if (oldPdfUrl && oldPdfUrl !== newPdfUrl) {
      console.log('🗑️ Deletando PDF antigo:', oldPdfUrl);
      await deletarPdfAntigo(oldPdfUrl);
    }

    res.json({ 
      success: true, 
      message: "Contrato assinado manualmente com sucesso!" 
    });

  } catch (error) {
    console.error("Erro na assinatura manual:", error);
    res.status(500).json({ error: error.message });
  }
});

// Função auxiliar para deletar PDF antigo
async function deletarPdfAntigo(pdfUrl) {
  try {
    if (!pdfUrl) return;

    // Extrair o nome do arquivo da URL
    const urlParts = pdfUrl.split('/storage/v1/object/public/contratos/');
    if (urlParts.length < 2) return;

    let fileName = urlParts[1].split('?')[0];

    const { error } = await supabase.storage
      .from('contratos')
      .remove([fileName]);

    if (error) {
      console.error('Erro ao deletar PDF antigo:', error);
    } else {
      console.log('✅ PDF antigo deletado com sucesso:', fileName);
    }
  } catch (e) {
    console.error('Falha ao deletar PDF antigo:', e);
  }
}

// ✅ VERSÃO SIMPLIFICADA E ESTÁVEL
async function compararPDFsComAssinatura(urlOriginal, urlNovo) {
  try {
    const pdfParse = require('pdf-parse');

    console.log('🔍 Comparando conteúdo dos PDFs...');

    const res1 = await fetch(urlOriginal);
    const res2 = await fetch(urlNovo);

    const buffer1 = Buffer.from(await res1.arrayBuffer());
    const buffer2 = Buffer.from(await res2.arrayBuffer());

    const data1 = await pdfParse(buffer1);
    const data2 = await pdfParse(buffer2);

    const cleanText1 = data1.text.replace(/\s+/g, ' ').trim();
    const cleanText2 = data2.text.replace(/\s+/g, ' ').trim();

    const diferenca = Math.abs(cleanText1.length - cleanText2.length);

    console.log(`📏 Texto original: ${cleanText1.length} caracteres`);
    console.log(`📏 Texto novo: ${cleanText2.length} caracteres`);
    console.log(`📊 Diferença: ${diferenca} caracteres`);

    // Tolerância razoável para assinatura manual
    return diferenca < 1800;

  } catch (error) {
    console.error("Erro na comparação:", error);
    return false; // Mostra aviso para o usuário
  }
}

app.post('/gerar-pdf', async (req, res) => {
  console.log('✅ REQUISIÇÃO RECEBIDA');

  const dados = req.body;

  try {
    // Buscar o modelo do contrato no Supabase
    const { data: modelo, error } = await supabase
      .from('modelo_contrato')
      .select('texto_completo')
      .eq('titulo', 'Contrato Principal')
      .single();

    if (error || !modelo) {
      return res.status(500).json({ error: 'Modelo de contrato não encontrado' });
    }

    let textoContrato = modelo.texto_completo;

    // Substituir as variáveis dinâmicas
    textoContrato = textoContrato
      .replace(/\{nome_contratante\}/g, dados.nome_contratante || '')
      .replace(/\{cpf_contratante\}/g, dados.cpf_contratante || '')
      .replace(/\{residencia_contratante\}/g, dados.residencia_contratante || '')
      .replace(/\{data_evento\}/g, dados.data_evento || '')
      .replace(/\{hora_inicio\}/g, dados.hora_inicio || '')
      .replace(/\{hora_fim\}/g, dados.hora_fim || '')
      .replace(/\{duracao\}/g, dados.duracao || '')
      .replace(/\{local_evento\}/g, dados.local_evento || '')
      .replace(/\{tipo_evento\}/g, dados.tipo_evento || '')
      .replace(/\{num_convidados\}/g, dados.num_convidados || '')
      .replace(/\{preco_por_convidado\}/g, dados.preco_por_convidado || '')
      .replace(/\{preco_total\}/g, dados.preco_total || '')
      .replace(/\{clausula_pagamento\}/g, dados.clausula_texto || '')
      .replace(/\{assinatura\}/g, dados.assinatura || '');
      
    // ==================== TRATAMENTO DO CARDÁPIO ====================
    let cardapioTexto = '';

    if (dados.cardapio_selecionado && Array.isArray(dados.cardapio_selecionado) && dados.cardapio_selecionado.length > 0) {
      cardapioTexto = dados.cardapio_selecionado
        .map(item => `• ${item}`)
        .join('\n');
    } else {
      cardapioTexto = 'Nenhum item selecionado.';
    }

    // Substitui garantindo que não fique lixo antes
    textoContrato = textoContrato.replace(/\{cardapio\}/g, cardapioTexto);

    const doc = new PDFDocument({ 
      size: 'A4', 
      margins: { top: 50, bottom: 50, left: 50, right: 50 } 
    });
    // ✅ FORÇA A COR DO TEXTO PARA PRETO
    doc.fillColor('black');           // ou '#000000'
    doc.strokeColor('black');
    let buffers = [];

    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', async () => {
      const pdfBuffer = Buffer.concat(buffers);
      const fileName = `contrato-${Date.now()}.pdf`

      // Salvar no Storage
      const { error: uploadError } = await supabase.storage
        .from('contratos')
        .upload(fileName, pdfBuffer, { contentType: 'application/pdf', upsert: true });

      if (uploadError) return res.status(500).json({ error: 'Erro ao salvar PDF' });

      const { data: urlData } = supabase.storage.from('contratos').getPublicUrl(fileName);

      // Salvar URL no contrato
      if (dados.id) {
        await supabase.from('contratos').update({ pdf_url: urlData.publicUrl }).eq('id', dados.id);
      }

      res.json({
        success: true,
        pdfUrl: urlData.publicUrl,
        message: 'PDF gerado com sucesso!'
      });
    });

    // ====================== Assinatura ======================
    function adicionarAssinatura(doc) {
      if (dados.assinatura !== 'Digital') return;

      const pageWidth = doc.page.width;
      const pageHeight = doc.page.height;

      // 📍 Assinatura pequena no canto
      doc.image('assinatura.png', pageWidth - 100, pageHeight - 80, {
        width: 60
      });
    }

    // ====================== MARCA D'ÁGUA ======================
    function adicionarMarcaDagua(doc) {
      const pageWidth = doc.page.width;
      const pageHeight = doc.page.height;

      doc.image('logo.png', pageWidth / 2 - 250, 50, { width: 500 });
      doc.opacity(0.2);
      doc.image('logo2.png', pageWidth / 2 - 75, pageHeight / 2 - 430, { width: 150 });
      doc.image('logo3.png', pageWidth / 2 - 75, pageHeight - 120, { width: 150 });
    }

    adicionarMarcaDagua(doc);
    adicionarAssinatura(doc);
    
    doc.on('pageAdded', () => {
      adicionarMarcaDagua(doc);
      adicionarAssinatura(doc); // assinatura pequena nas páginas extras
    });

    // Gerar o PDF com o texto do Supabase
    doc.fontSize(16).text('CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE BUFFET', { align: 'center' });
    doc.moveDown(2);

    doc.fontSize(12).text(textoContrato, { align: 'justify' });

    // Assinatura
    doc.moveDown(7);

      // 📍 Pega posição atual
      const yAssinatura = doc.y;

      // 🔥 Assinatura digital (se for o caso)
      if (dados.assinatura === 'Digital') {
        doc.image('assinatura.png', 80, yAssinatura - 60, {
          width: 120
        });
      }

      // Linha de assinatura
      doc.text('_______________________                             _____________________', { align: 'justify' });

      doc.text('       CONTRATADA                                                   CONTRATANTE      ', { align: 'justify' });

    doc.end();

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao gerar PDF' });
  }
});

const PORT = process.env.PORT || 3001;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Backend rodando na porta ${PORT}`);
});
