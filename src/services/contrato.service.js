const supabase = require('../config/supabase');
const { deletarPdfAntigo, compararPDFsComAssinatura } = require('../utils/pdfUtils');

async function atualizarAssinaturaManual(id, pdf_url) {
  try {
    console.log('📄 Assinatura manual - ID:', id);

    const { data: contrato, error: fetchError } = await supabase
      .from('contratos')
      .select('pdf_url')
      .eq('id', id)
      .single();

    if (fetchError || !contrato) {
      throw new Error("Contrato não encontrado");
    }

    const oldPdfUrl = contrato.pdf_url;
    const newPdfUrl = pdf_url;

    let conteudoIgual = true;
    if (oldPdfUrl) {
      conteudoIgual = await compararPDFsComAssinatura(oldPdfUrl, newPdfUrl);
    }

    if (!conteudoIgual) {
      return {
        warning: true,
        message: "O conteúdo do contrato foi alterado além da assinatura. Deseja prosseguir mesmo assim?"
      };
    }

    const { error: updateError } = await supabase
      .from('contratos')
      .update({
        pdf_url: newPdfUrl,
        status_assinatura: "assinado"
      })
      .eq('id', id);

    if (updateError) throw updateError;

    if (oldPdfUrl && oldPdfUrl.split('?')[0] !== newPdfUrl.split('?')[0]) {
      await deletarPdfAntigo(supabase, oldPdfUrl); // passou supabase
    }

    return { success: true, message: "Contrato assinado manualmente com sucesso!" };
  } catch (error) {
    console.error("Erro na assinatura manual:", error);
    throw error;
  }
}

module.exports = { atualizarAssinaturaManual };