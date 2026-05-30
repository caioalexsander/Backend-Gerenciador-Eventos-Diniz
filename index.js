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
    if (
      oldPdfUrl &&
      oldPdfUrl.split('?')[0] !== newPdfUrl.split('?')[0]
    ) {
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

    // Limpeza do texto
    const clean = (txt) =>
      txt
        .replace(/\s+/g, ' ')
        .replace(/[^\w\sÀ-ÿ]/g, '')
        .trim()
        .toLowerCase();

    const text1 = clean(data1.text);
    const text2 = clean(data2.text);

    console.log('📏 Texto original:', text1.length);
    console.log('📏 Texto novo:', text2.length);

    // Se forem exatamente iguais
    if (text1 === text2) {
      console.log('✅ PDFs idênticos');
      return true;
    }

    // Similaridade simples
    const palavras1 = text1.split(' ');
    const palavras2 = text2.split(' ');

    let iguais = 0;

    for (const palavra of palavras1) {
      if (palavras2.includes(palavra)) {
        iguais++;
      }
    }

    const similaridade = iguais / palavras1.length;

    console.log(
      `📊 Similaridade: ${(similaridade * 100).toFixed(2)}%`
    );

    // Aceita pequenas diferenças da assinatura
    return similaridade > 0.95;

  } catch (error) {
    console.error('Erro na comparação:', error);
    return true;
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
    doc.fillColor('#000000');           // ou '#000000'
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
      doc.opacity(1);
    }

    adicionarMarcaDagua(doc);
    adicionarAssinatura(doc);
    
    doc.on('pageAdded', () => {
      adicionarMarcaDagua(doc);
      adicionarAssinatura(doc); // assinatura pequena nas páginas extras
    });

    doc.opacity(1);
    
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

// ====================== ASSINATURA DIGITAL ======================

// 1. Gerar link de assinatura digital
app.post('/contratos/:id/gerar-link-assinatura', async (req, res) => {
  const { id } = req.params;

  try {
    const { data: contrato, error } = await supabase
      .from('contratos')
      .select('pdf_url, titulo, cliente_nome')
      .eq('id', id)
      .single();

    if (error || !contrato?.pdf_url) {
      return res.status(404).json({ error: "Contrato ou PDF não encontrado" });
    }

    // Gerar token seguro
    const token = require('crypto').randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 horas

    // Salvar token
    await supabase.from('assinatura_tokens').upsert({
      contrato_id: id,
      token,
      expires_at: expiresAt.toISOString()
    });

    const baseUrl = process.env.FRONTEND_URL || 'https://seu-dominio.com';
    const signingUrl = `${baseUrl}/assinar/${token}`;

    res.json({
      success: true,
      signingUrl,
      message: "Link de assinatura digital gerado com sucesso"
    });

  } catch (error) {
    console.error("Erro ao gerar link de assinatura:", error);
    res.status(500).json({ error: "Erro interno ao gerar link" });
  }
});

// 2. Servir página web de assinatura (GET)
app.get('/assinar/:token', async (req, res) => {
  const { token } = req.params;

  // Validação simples do token (melhorar depois com middleware)
  const { data: tokenData } = await supabase
    .from('assinatura_tokens')
    .select('contrato_id, expires_at')
    .eq('token', token)
    .single();

  if (!tokenData || new Date(tokenData.expires_at) < new Date()) {
    return res.send('<h2>Link expirado ou inválido.</h2>');
  }

  res.send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Assinar Contrato - Diniz Eventos</title>
      <style>
        body { font-family: Arial, sans-serif; text-align: center; padding: 20px; background: #f8f9fa; }
        canvas { border: 2px solid #333; border-radius: 8px; touch-action: none; background: white; }
        button { padding: 12px 24px; margin: 10px; font-size: 16px; border: none; border-radius: 6px; cursor: pointer; }
        .btn-assinar { background: #28a745; color: white; }
        .btn-limpar { background: #dc3545; color: white; }
      </style>
    </head>
    <body>
      <h2>Assinatura Digital do Contrato</h2>
      <p>Use o dedo ou mouse para assinar abaixo:</p>
      <canvas id="canvas" width="600" height="300"></canvas><br><br>
      <button class="btn-limpar" onclick="limpar()">Limpar Assinatura</button>
      <button class="btn-assinar" onclick="concluirAssinatura()">Concluir e Assinar</button>

      <script>
        const canvas = document.getElementById('canvas');
        const ctx = canvas.getContext('2d');
        let desenhando = false;

        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#000';

        // Suporte a mouse e touch
        canvas.addEventListener('mousedown', start);
        canvas.addEventListener('mousemove', draw);
        canvas.addEventListener('mouseup', stop);
        canvas.addEventListener('touchstart', start);
        canvas.addEventListener('touchmove', draw);
        canvas.addEventListener('touchend', stop);

        function start(e) {
          desenhando = true;
          draw(e);
        }

        function stop() { desenhando = false; ctx.beginPath(); }

        function draw(e) {
          if (!desenhando) return;
          const rect = canvas.getBoundingClientRect();
          const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
          const y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
          ctx.lineTo(x, y);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(x, y);
        }

        function limpar() {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }

        async function concluirAssinatura() {
          const signatureData = canvas.toDataURL('image/png');
          const response = await fetch('/contratos/assinar/${token}', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ signature: signatureData })
          });

          if (response.ok) {
            alert('✅ Assinatura realizada com sucesso!');
            window.location.href = '/assinar-sucesso.html'; // ou página simples
          } else {
            alert('Erro ao salvar assinatura');
          }
        }
      </script>
    </body>
    </html>
  `);
});

// 3. Receber assinatura e processar PDF
app.post('/contratos/assinar/:token', async (req, res) => {
  const { token } = req.params;
  const { signature } = req.body;

  try {
    // Validar token
    const { data: tokenData, error: tokenError } = await supabase
      .from('assinatura_tokens')
      .select('contrato_id')
      .eq('token', token)
      .single();

    if (tokenError || !tokenData) {
      return res.status(400).json({ error: "Token inválido ou expirado" });
    }

    const contratoId = tokenData.contrato_id;

    // Buscar contrato
    const { data: contrato } = await supabase
      .from('contratos')
      .select('pdf_url')
      .eq('id', contratoId)
      .single();

    if (!contrato?.pdf_url) {
      return res.status(404).json({ error: "PDF não encontrado" });
    }

    // Baixar PDF original
    const pdfResponse = await fetch(contrato.pdf_url);
    const pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());

    // Adicionar assinatura com pdf-lib
    const { PDFDocument, StandardFonts } = require('pdf-lib');
    const pdfDoc = await PDFDocument.load(pdfBuffer);

    const pages = pdfDoc.getPages();
    const lastPage = pages[pages.length - 1];

    // Converter assinatura base64 para bytes
    const signatureBytes = Buffer.from(signature.split(',')[1], 'base64');
    const signatureImage = await pdfDoc.embedPng(signatureBytes);

    // Posicionar assinatura no final da última página
    lastPage.drawImage(signatureImage, {
      x: 50,
      y: 80,
      width: 250,
      height: 100,
    });

    lastPage.drawText(`Assinado em ${new Date().toLocaleDateString('pt-BR')}`, {
      x: 50,
      y: 50,
      size: 12,
      font: await pdfDoc.embedFont(StandardFonts.Helvetica),
    });

    const updatedPdfBytes = await pdfDoc.save();

    // Upload novo PDF
    const fileName = `contrato_${contratoId}_assinado_${Date.now()}.pdf`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('contratos')
      .upload(fileName, updatedPdfBytes, {
        contentType: 'application/pdf',
        upsert: true
      });

    if (uploadError) throw uploadError;

    const newPdfUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/contratos/${fileName}`;

    // Atualizar banco
    await supabase
      .from('contratos')
      .update({
        pdf_url: newPdfUrl,
        status_assinatura: "assinado"
      })
      .eq('id', contratoId);

    // Deletar PDF antigo
    await deletarPdfAntigo(contrato.pdf_url);

    // Invalidar token
    await supabase.from('assinatura_tokens').delete().eq('token', token);

    res.json({ success: true, newPdfUrl });

  } catch (error) {
    console.error("Erro na assinatura digital:", error);
    res.status(500).json({ error: "Erro ao processar assinatura" });
  }
});

const PORT = process.env.PORT || 3001;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Backend rodando na porta ${PORT}`);
});
