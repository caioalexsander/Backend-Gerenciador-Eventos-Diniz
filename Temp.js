const express = require('express');
const cors = require('cors');
const PDFDocument = require('pdfkit');

const app = express();
app.use(cors());
app.use(express.json());

app.post('/gerar-pdf', (req, res) => {
  console.log('REQUISIÇÃO RECEBIDA');

  const dados = req.body;

  try {
    const doc = new PDFDocument();

    let buffers = [];
    doc.on('data', buffers.push.bind(buffers));

    doc.on('end', () => {
      const pdfBase64 = Buffer.concat(buffers).toString('base64');
      res.json({ pdf: pdfBase64 });
    });

    // 📌 CONTRATANTE
    doc.fontSize(14).text('Dados da Contratante:', { underline: true });
    doc.fontSize(12).text(`Nome: ${dados.nome_contratante || 'Não informado'}`);
    doc.text(`CPF: ${dados.cpf_contratante || 'Não informado'}`);
    doc.text(`Residência: ${dados.residencia_contratante || 'Não informado'}`);

    doc.moveDown();

    // 📌 EVENTO
    doc.fontSize(14).text('Detalhes do Evento:', { underline: true });
    doc.fontSize(12).text(`Data: ${dados.data_evento}`);
    doc.text(`Horário: ${dados.hora_inicio} até ${dados.hora_fim}`);
    doc.text(`Local: ${dados.local_evento}`);
    doc.text(`Tipo: ${dados.tipo_evento}`);
    doc.text(`Convidados: ${dados.num_convidados}`);

    doc.moveDown();

    // 📌 CARDÁPIO
    doc.fontSize(14).text('Cardápio Selecionado:', { underline: true });

    if (dados.cardapio_selecionado?.length) {
      dados.cardapio_selecionado.forEach(item => {
        doc.text(`• ${item}`);
      });
    } else {
      doc.text('Nenhum item selecionado');
    }

    doc.moveDown();

    // 💰 VALOR
    doc.fontSize(14).text(`Valor Total: R$ ${dados.preco_total || '0,00'}`, {
      bold: true
    });

    doc.text(`Pagamento: ${dados.clausula_pagamento}`);
    doc.text(`Assinatura: ${dados.assinatura}`);

    doc.end();

  } catch (err) {
    console.error(err);
    res.status(500).send('Erro ao gerar PDF');
  }
});

app.listen(3001, '0.0.0.0', () => {
  console.log('🚀 Backend rodando');
});


doc.page.margins = { top: 50, bottom: 50, left: 50, right: 50 };

doc
  .fontSize(16)
  .text('CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE BUFFET', {
    align: 'center'
  });

doc.moveDown();
doc.fontSize(12).text(`              

Pelo presente instrumento particular de prestação de serviços, de um lado Eventos Diniz., com sede na cidade de Belo Horizonte., Estado de Minas Gerais., à Rua São João , nº83., inscrita no CNPJ sob o nº28295648000151., neste ato representada por PRISCILA DINIZ DELESPORTE ora em diante denominada CONTRATADA, têm entre si como justo e contratado o que segue:                   

A CONTRATADA compromete-se a fornecer todos os serviços de atendimento aos convidados de ${dados.nome_contratante || 'CLIENTE'} inscrita pelo CPF ${dados.cpf_contratante || 'Não informado'} Residente em  ${dados.residencia_contratante || 'Não informado'}.        

Esses serviços serão prestados no dia ${dados.data_evento} evento a realizar no endereço ${dados.local_evento}, horário de início ${dados.hora_inicio} até ${dados.hora_fim} com duracao horas de ${dados.duração}, equipe chega ao local com 3 horas de antecedência.   

Compreendem a execução do serviço o fornecimento de alimentação, constante de  cardápio  

pré programado entre as partes, foi definido antecipadamente, constando de     : 1.3      
    
    `, {
  align: 'justify',
  width: 450
});