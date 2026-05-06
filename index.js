const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const PDFDocument = require('pdfkit');

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
    const doc = new PDFDocument({ margin: 50 });

    let buffers = [];
    doc.on('data', buffers.push.bind(buffers));

    doc.on('end', async () => {
      const pdfBuffer = Buffer.concat(buffers);
      const fileName = `contrato-${(dados.nome_contratante || 'cliente').replace(/[^a-zA-Z0-9]/g, '')}-${Date.now()}.pdf`;

      // Salvar no Supabase Storage
      /*const { error: uploadError } = await supabase.storage
        .from('contratos')
        .upload(fileName, pdfBuffer, {
          contentType: 'application/pdf',
          upsert: true
        });*/

      const { error: uploadError } = await supabase.storage
        .from('contratos')
        .upload(fileName, pdfBuffer, {
          contentType: 'application/pdf',
          upsert: true
        });

      if (uploadError) {
        console.error('Erro upload:', uploadError);
        return res.status(500).json({ error: 'Erro ao salvar PDF' });
      }

      const { data: urlData } = supabase.storage
        .from('contratos')
        .getPublicUrl(fileName);

      console.log('✅ PDF salvo:', urlData.publicUrl);

      // Salvar a URL do PDF no banco
      await supabase
        .from('contratos')
        .update({ pdf_url: urlData.publicUrl })
        .eq('id', dados.id);   // Vamos passar o id do contrato
      
      res.json({
        success: true,
        pdfUrl: urlData.publicUrl,
        message: 'PDF gerado e salvo com sucesso!'
      });
    });

  // ====================== MARCA D'ÁGUA ======================
    function adicionarMarcaDagua(doc) {
      const pageWidth = doc.page.width;
      const pageHeight = doc.page.height;

      doc.opacity(0.1);
      doc.image('logo.png', pageWidth / 2 - 250, 50, { width: 500 });
      doc.opacity(0.2);
      doc.image('logo2.png', pageWidth / 2 - 75, pageHeight / 2 - 430, { width: 150 });
      doc.image('logo3.png', pageWidth / 2 - 75, pageHeight - 120, { width: 150 });
      doc.opacity(1);
    }

    adicionarMarcaDagua(doc);

    doc.on('pageAdded', () => adicionarMarcaDagua(doc));

// ====================== SEU CONTEÚDO DO CONTRATO ======================

doc.fontSize(16).text('CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE BUFFET', { align: 'center' });

doc.moveDown();

doc.fontSize(12);

doc.font('Helvetica').text(
  'Pelo presente instrumento particular de prestação de serviços, de um lado Eventos Diniz, com sede na cidade de Belo Horizonte, Estado de Minas Gerais, à Rua São João, nº 83, inscrita no CNPJ sob o nº 28.295.648/0001-51, neste ato representada por ',
  { continued: true }
);

doc.font('Helvetica-Bold').text(
  'Priscila Diniz Delesporte',
  { continued: true }
);

doc.font('Helvetica').text(
  ' ora em diante denominada CONTRATADA, têm entre si como justo e contratado o que segue:'
);

doc.moveDown();

doc.font('Helvetica').text(
  '1. A CONTRATADA compromete-se a fornecer todos os serviços de atendimento aos convidados da contratante ',
  { continued: true }
);

doc.font('Helvetica-Bold').text(
  `${dados.nome_contratante || 'CLIENTE'}`,
  { continued: true }
);

doc.font('Helvetica').text(
  ', inscrita pelo CPF ',
  { continued: true }
);

doc.font('Helvetica-Bold').text(
  `${dados.cpf_contratante || 'Não informado'}`,
  { continued: true }
);

doc.font('Helvetica').text(
  ', residente em ',
  { continued: true }
);

doc.font('Helvetica-Bold').text(
  `${dados.residencia_contratante || 'Não informado'}.`,
);

doc.moveDown();

doc.font('Helvetica').text(
  '1.1  Esses serviços serão prestados no dia ',
  { 
    indent: 20,
    continued: true 
  }
);

doc.font('Helvetica-Bold').text(
  `${dados.data_evento || 'Não informado'}`,
  { continued: true }
);

doc.font('Helvetica').text(
  ' as ',
  { continued: true }
);

doc.font('Helvetica-Bold').text(
  `${dados.hora_inicio || 'Não informado'}`,
  { continued: true }
);

doc.font('Helvetica').text(
  ' ate ',
  { continued: true }
);

doc.font('Helvetica-Bold').text(
  `${dados.hora_fim || 'Não informado'}`,
  { continued: true }
);

doc.font('Helvetica').text(
  ' com duraçao de ',
  { continued: true }
);

doc.font('Helvetica-Bold').text(
  `${dados.duracao || 'Não informado'}`,
  { continued: true }
);

doc.font('Helvetica').text(
  ' horas, no endereço: ',
  { continued: true }
);

doc.font('Helvetica-Bold').text(
  `${dados.local_evento || 'Não informado'} .`
);

doc.moveDown();

doc.font('Helvetica').text(
  '1.2  Compreendem a execução do serviço o fornecimento de alimentação, constante de cardápio pré programado entre as partes, foi definido antecipadamente, constando de :',
  { 
    indent: 20,
  }
);

doc.moveDown();

doc.font('Helvetica-Bold').text(
  `${dados.tipo_evento}.`
);

doc.moveDown();

doc.font('Helvetica-Bold');

if (dados.cardapio_selecionado?.length) {
  dados.cardapio_selecionado.forEach(item => {
    doc.text(`• ${item}`, {
      indent: 20
    });
  });
} else {
  doc.text('Nenhum item selecionado', {
    indent: 20
  });
}

doc.font('Helvetica'); // volta ao normal

doc.moveDown();

doc.text(`              

2.  Os serviços ora contratados deverão ser executados por funcionários devidamente habilitados da CONTRATADA, que tem a exclusiva responsabilidade pela sua contratação e demissão, pelo pagamento de seu trabalho, bem como pelo cumprimento de todas as obrigações legais,  de qualquer natureza, para com os mesmos, notadamente as referentes às leis trabalhistas e previdenciárias, ficando dessa forma, expressamente, excluída a responsabilidade da CONTRATANTE sobre tal matéria.                   

3.  A CONTRATADA ficará responsável, ainda, pelas obrigações tributárias decorrentes da prestação dos serviços ora contratados.                   

4.  A CONTRATADA responsabilizar-se-á por todo e qualquer prejuízo que possa ser acarretado à CONTRATANTE em função do descumprimento de dispositivos legais relativos aos serviços acima enumerados.                   

5.  A CONTRATANTE, por sua vez, se obriga a fornecer à CONTRATADA todas as diretrizes dos trabalhos a serem executados.      
    
    `, {
  align: 'justify',
  width: 450
});

doc.moveDown();

doc.font('Helvetica').text(
  `${dados.clausula_texto }`,
  { continued: true }
);

doc.moveDown();

doc.font('Helvetica').text(
  '7. Evento contrato para ',
  { continued: true }
);

doc.font('Helvetica-Bold').text(
  `${dados.num_convidados }`,
  { continued: true }
);

doc.font('Helvetica').text(
  'pessoas ficando a contratante ciente que o buffet cobra ',
  { continued: true }
);

doc.font('Helvetica-Bold').text(
  `${dados.preco_por_convidado }`,
  { continued: true }
);

doc.font('Helvetica').text(
  `Reais por convidado excedente crianças pagam a partir de 6 anos. Fica uma recepção para contagem convidados do buffet. .`
);

doc.moveDown();

doc.text(`              

8. E de responsabilidade da contratante informar condições do espaço e se possível uma visita técnica do local ate 15 dias antes do evento, o buffet não transporta gás de cozinha,tina,frezzer e gelo.   

9.  Buffet será servido com comidas e bebidas durante 4hs de evento a vontade, se a contratante optar por horas a mais é necessário avisar a coordenadora do evento com 20 minutos antes do término para combinar valor excedente, quebras de tacas por convidados e consume será cobrado uma taxa  por cada peça, taças 8.00 unidade, prato jantar 18.00,prato sobremesa 15.00 consume 13.00 ou o cliente pode comprar a reposição  todas as sobras cruas e congeladas, refrigerantes fechados e sucos pertencem ao buffet, exceto doces, bolo e. Personalizados, quando os mesmo estiverem no contrato, tudo que estiver pronto deixamos para o contratante desde que tenham Vasilhas para colocar, informar ao buffet o número de pessoas de equipe para lanchar . 

    9.1  Responderá por perdas e danos a serem apurados em ação própria a parte que infringir qualquer das cláusulas do presente contrato, casa haja desistência da contratante ou da contratada o valor terá que ser restituído de imediato a parte prejudicada, sendo que desistência gera uma multa de 50% do valor fechado do contrato, a Lista de convidados terá que ser entregue a Eventos Diniz .

10. Fica eleito o Foro da Comarca em Minas Gerais fórum Lafaiete para dirimir qualquer litígio que possa surgir na efetivação do presente contrato.     

    10.1  Cerimonial entra em contato quando fechado conosco, e monta o grupo para homenagens. 

E por estarem as partes de pleno acordo com o disposto neste instrumento particular, assinam-no na presença das duas testemunhas abaixo, em ..... vias de igual teor e forma.

    `, {
  align: 'justify',
  width: 450
});

doc.moveDown();

doc.end();

  } catch (err) {
    console.error(err);
    res.status(500).send('Erro ao gerar PDF');
  }
});

app.listen(3001, '0.0.0.0', () => {
  console.log('🚀 Backend rodando');
});
