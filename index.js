const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const PDFDocument = require('pdfkit');
const path = require('path');
const app = express();
app.use(cors());
app.use(express.json());

// ====================== SUPABASE ======================
const supabase = createClient(
  'https://hrccgivelzkkxtutbgho.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhyY2NnaXZlbHpra3h0dXRiZ2hvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzgzMjc2MiwiZXhwIjoyMDkzNDA4NzYyfQ.Nfo9DLhYRTCahQOCeYRMyDzRlhU3g1HBb-W2XyrJbZs'   // ← Cole aqui a Service Role Key
);

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

    const doc = new PDFDocument({ margin: 50 });
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
      doc.image( 'assinatura.png', pageWidth - 100, pageHeight - 80, {width: 60});
    }

    // ====================== MARCA D'ÁGUA ======================
    function adicionarMarcaDagua(doc) {
      const pageWidth = doc.page.width;
      const pageHeight = doc.page.height;

      doc.image( 'logo.png', pageWidth / 2 - 250, 50, { width: 500 });
      doc.opacity(0.2);
      doc.image( 'logo2.png', pageWidth / 2 - 75, pageHeight / 2 - 430, { width: 150 });
      doc.image( 'logo3.png', pageWidth / 2 - 75, pageHeight - 120, { width: 150 });
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

process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
});

process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION:', err);
});