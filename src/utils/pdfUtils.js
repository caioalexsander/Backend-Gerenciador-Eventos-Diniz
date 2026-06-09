const pdfParse = require('pdf-parse');

async function deletarPdfAntigo(supabase, pdfUrl) {
  try {
    if (!pdfUrl) return;

    const urlParts = pdfUrl.split('/storage/v1/object/public/contratos/');
    if (urlParts.length < 2) return;

    let fileName = urlParts[1].split('?')[0];

    const { error } = await supabase.storage
      .from('contratos')
      .remove([fileName]);

    if (error) {
      console.error('Erro ao deletar PDF antigo:', error);
    } else {
      console.log('✅ PDF antigo deletado:', fileName);
    }
  } catch (e) {
    console.error('Falha ao deletar PDF antigo:', e);
  }
}

function adicionarTextoComNegrito(doc, texto, options = {}) {
  if (!texto) return;

  // Divide o texto mantendo os **...**
  const partes = texto.split(/(\*\*.*?\*\*)/gs);

  partes.forEach((parte) => {
    if (parte.startsWith('**') && parte.endsWith('**')) {
      const conteudo = parte.slice(2, -2).trim();
      doc
        .font('Helvetica-Bold')
        .text(conteudo, { continued: true, ...options });
    } else if (parte.trim()) {
      doc
        .font('Helvetica')
        .text(parte, { continued: true, ...options });
    }
  });

  doc.font('Helvetica'); // volta ao normal
}

async function compararPDFsComAssinatura(urlOriginal, urlNovo) {
  try {
    console.log('🔍 Comparando conteúdo dos PDFs...');

    const res1 = await fetch(urlOriginal);
    const res2 = await fetch(urlNovo);

    const buffer1 = Buffer.from(await res1.arrayBuffer());
    const buffer2 = Buffer.from(await res2.arrayBuffer());

    const data1 = await pdfParse(buffer1);
    const data2 = await pdfParse(buffer2);

    const clean = (txt) =>
      txt
        .replace(/\s+/g, ' ')
        .replace(/[^\w\sÀ-ÿ]/g, '')
        .trim()
        .toLowerCase();

    const text1 = clean(data1.text);
    const text2 = clean(data2.text);

    if (text1 === text2) {
      console.log('✅ PDFs idênticos');
      return true;
    }

    const palavras1 = text1.split(' ');
    const palavras2 = text2.split(' ');

    let iguais = 0;
    for (const palavra of palavras1) {
      if (palavras2.includes(palavra)) iguais++;
    }

    const similaridade = iguais / palavras1.length;
    console.log(`📊 Similaridade: ${(similaridade * 100).toFixed(2)}%`);

    return similaridade > 0.95;
  } catch (error) {
    console.error('Erro na comparação:', error);
    return true;
  }
}

module.exports = { deletarPdfAntigo, compararPDFsComAssinatura, adicionarTextoComNegrito };