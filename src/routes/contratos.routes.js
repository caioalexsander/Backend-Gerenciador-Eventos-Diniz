const express = require('express');
const { atualizarAssinaturaManual } = require('../services/contrato.service');
const { gerarPdf } = require('../services/pdf.service');
const supabase = require('../config/supabase');
const { deletarPdfAntigo, compararPDFsComAssinatura } = require('../utils/pdfUtils');

const router = express.Router();

// ====================== ASSINATURA MANUAL ======================
router.put('/contratos/:id/assinatura-manual', async (req, res) => {
  const { id } = req.params;
  const { pdf_url } = req.body;

  try {
    const result = await atualizarAssinaturaManual(id, pdf_url);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ====================== GERAR PDF ======================
router.post('/gerar-pdf', async (req, res) => {
  try {
    const result = await gerarPdf(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ====================== ASSINATURA DIGITAL ======================

// 1. Gerar link
router.post('/contratos/:id/gerar-link-assinatura', async (req, res) => {
  const { id } = req.params;
  try {
    const { data: contrato } = await supabase
      .from('contratos')
      .select('pdf_url')
      .eq('id', id)
      .single();

    if (!contrato?.pdf_url) {
      return res.status(404).json({ error: "Contrato ou PDF não encontrado" });
    }

    const token = require('crypto').randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await supabase.from('assinatura_tokens').upsert({
      contrato_id: id,
      token,
      expires_at: expiresAt.toISOString()
    });

    const signingUrl = `${process.env.FRONTEND_URL}/assinar/${token}`;

    res.json({ success: true, signingUrl, message: "Link de assinatura gerado" });
  } catch (error) {
    console.error('Erro ao gerar link:', error);
    res.status(500).json({ error: "Erro ao gerar link" });
  }
});

// 2. Página de assinatura digital (HTML + Canvas)
router.get('/assinar/:token', async (req, res) => {
  const { token } = req.params;

  // Verificar token (opcional, mas recomendado)
  const { data: tokenData } = await supabase
    .from('assinatura_tokens')
    .select('contrato_id, expires_at')
    .eq('token', token)
    .single();

  if (!tokenData || new Date(tokenData.expires_at) < new Date()) {
    return res.status(400).send('Link de assinatura inválido ou expirado.');
  }

  res.send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Assinar Contrato</title>
      <style>
        body { font-family: Arial; text-align: center; padding: 20px; background: #f0f0f0; }
        canvas { border: 2px solid #000; background: white; margin: 20px 0; }
        button { padding: 15px 30px; margin: 10px; font-size: 18px; border: none; border-radius: 8px; cursor: pointer; }
        .btn-assinar { background: #28a745; color: white; }
        .btn-limpar { background: #dc3545; color: white; }
      </style>
    </head>
    <body>
      <h2>Assinatura Digital do Contrato</h2>
      <canvas id="canvas" width="600" height="300"></canvas><br>
      <button class="btn-limpar" onclick="limpar()">Limpar</button>
      <button class="btn-assinar" onclick="concluir()">Concluir Assinatura</button>

      <script>
        const canvas = document.getElementById('canvas');
        const ctx = canvas.getContext('2d');
        let desenhando = false;
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';

        canvas.addEventListener('mousedown', start);
        canvas.addEventListener('mousemove', draw);
        canvas.addEventListener('mouseup', stop);
        canvas.addEventListener('touchstart', start);
        canvas.addEventListener('touchmove', draw);
        canvas.addEventListener('touchend', stop);

        function start(e){ desenhando = true; draw(e); }
        function stop(){ desenhando = false; ctx.beginPath(); }

        function draw(e) {
          if (!desenhando) return;
          const rect = canvas.getBoundingClientRect();
          const x = e.clientX || e.touches[0].clientX - rect.left;
          const y = e.clientY || e.touches[0].clientY - rect.top;
          ctx.lineTo(x, y);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(x, y);
        }

        function limpar() {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }

        async function concluir() {
          const assinaturaBase64 = canvas.toDataURL('image/png');
          // Aqui você pode enviar para o backend se quiser salvar a assinatura
          alert('Assinatura concluída com sucesso! (Implemente o salvamento se necessário)');
          window.close();
        }
      </script>
    </body>
    </html>
  `);
});

module.exports = router;