const supabase = require('../config/supabase');

async function deletarPdfAntigo(pdfUrl) {
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
      console.log('✅ PDF antigo deletado com sucesso:', fileName);
    }
  } catch (e) {
    console.error('Falha ao deletar PDF antigo:', e);
  }
}

module.exports = { deletarPdfAntigo };