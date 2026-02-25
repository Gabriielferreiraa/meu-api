const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

// ROTA PRINCIPAL (Para checar se o servidor está vivo)
app.get('/', (req, res) => {
    res.send('<h1>Servidor WA Original Ativo!</h1><p>Aguardando notificações do Mercado Pago...</p>');
});

// ROTA DE SUCESSO (O que o cliente vê após pagar)
app.get('/sucesso', async (req, res) => {
    const idPagamento = req.query.payment_id;
    console.log(`Cliente redirecionado para sucesso. ID: ${idPagamento}`);

    if (!idPagamento) return res.send("<h1>Aguardando confirmação de pagamento...</h1>");

    try {
        const mpResponse = await axios.get(`https://api.mercadopago.com/v1/payments/${idPagamento}`, {
            headers: { 'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN.trim()}` }
        });

        const pagamento = mpResponse.data;
        const valor = pagamento.transaction_amount;
        const senhaPadrao = `Zap@${idPagamento.toString().slice(-4)}`;
        const email = pagamento.payer?.email || "seu e-mail de compra";

        if (pagamento.status === 'approved') {
            let titulo = "";
            let instrucoes = "";

            if (valor >= 59.00) {
                titulo = "Sua conta de Revendedor está pronta! 🚀";
                instrucoes = `
                    <p>Você agora tem acesso ao nosso painel administrativo.</p>
                    <div style="background: #e9ecef; padding: 15px; border-radius: 8px; display: inline-block; text-align: left; border: 1px solid #ccc;">
                        <strong>URL de Login:</strong> <a href="https://control.zaplink.net/" target="_blank">control.zaplink.net</a><br>
                        <strong>E-mail:</strong> ${email}<br>
                        <strong>Senha Provisória:</strong> <span style="color: #d63384; font-weight: bold;">${senhaPadrao}</span>
                    </div>
                    <p style="color: #666; font-size: 0.9em; margin-top: 10px;">* Recomendamos alterar sua senha após o primeiro login.</p>
                `;
            } else {
                titulo = "Sua Licença foi Gerada! ✅";
                instrucoes = `
                    <p>Sua licença foi processada e enviada para o e-mail: <strong>${email}</strong></p>
                    <p>Se você não receber em 5 minutos, verifique sua caixa de spam.</p>
                `;
            }

            res.send(`
                <div style="font-family: sans-serif; text-align: center; padding: 40px; line-height: 1.6;">
                    <h1 style="color: #198754;">${titulo}</h1>
                    ${instrucoes}
                    <br><br>
                    <a href="https://wasenderbrasil.me" style="background: #0d6efd; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">Voltar para o Site</a>
                </div>
            `);
        } else {
            res.send("<h1>O pagamento ainda está sendo processado.</h1><p>Por favor, atualize esta página em alguns segundos.</p>");
        }
    } catch (e) {
        res.send("<h1>Erro ao carregar dados.</h1><p>Se o pagamento foi aprovado, sua licença chegará por e-mail em instantes.</p>");
    }
});

// WEBHOOK (Comunicação automática entre MP e Render)
app.post('/webhook', async (req, res) => {
    // Responde logo ao MP
    res.sendStatus(200);

    const body = req.body;
    console.log("-----------------------------------------");
    console.log("NOVA NOTIFICAÇÃO RECEBIDA DO MERCADO PAGO");
    console.log("Corpo:", JSON.stringify(body));
    console.log("-----------------------------------------");

    let idPagamento = null;
    if (body.data && body.data.id) idPagamento = body.data.id;
    else if (body.id) idPagamento = body.id;

    if (!idPagamento || idPagamento === '123456789') {
        console.log("Aviso: Notificação ignorada (Teste ou sem ID real).");
        return;
    }

    try {
        console.log(`Buscando detalhes do pagamento real: ${idPagamento}`);

        const mpResponse = await axios.get(`https://api.mercadopago.com/v1/payments/${idPagamento}`, {
            headers: { 'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN.trim()}` }
        });

        const p = mpResponse.data;

        if (p.status === 'approved') {
            const valor = p.transaction_amount;
            const email = (p.payer?.email || p.additional_info?.payer?.email || `cliente_${idPagamento}@mercadopago.com`).trim();
            const nome = p.payer?.first_name || "Cliente";
            const senha = `Zap@${idPagamento.toString().slice(-4)}`;

            console.log(`Pagamento Aprovado! Valor: R$ ${valor}. Processando entrega...`);

            // DECISÃO DE ENTREGA BASEADA NO PREÇO
            if (valor >= 239.00) {
                await criarAdmin(email, nome, senha, 999999);
            } else if (valor >= 139.00) {
                await criarAdmin(email, nome, senha, 50);
            } else if (valor >= 59.00) {
                await criarAdmin(email, nome, senha, 10);
            } else if (valor >= 49.00) {
                await gerarLicenca(email, nome, "VITALICIA");
            } else if (valor >= 29.00) {
                await gerarLicenca(email, nome, "ANUAL");
            }
            
            console.log(`Entrega finalizada para ${email}`);
        } else {
            console.log(`Pagamento ${idPagamento} ainda com status: ${p.status}`);
        }
    } catch (error) {
        console.error('Erro no processamento do Webhook:', error.message);
    }
});

// FUNÇÕES DE COMUNICAÇÃO COM A ZAPLINK
async function criarAdmin(email, nome, senha, cota) {
    console.log(`Chamando API Create Admin para ${email} (Cota: ${cota})`);
    try {
        const res = await axios.post('https://control.zaplink.net/api/create_admin', {
            token: process.env.ZAPLINK_TOKEN,
            admin_email: email,
            admin_name: nome,
            admin_password: senha,
            admin_role: "admin",
            license_quota: cota,
            allowed_products: "waoriginal"
        });
        console.log("Resposta Zaplink (Admin):", res.data);
    } catch (e) {
        console.error("Erro Zaplink (Admin):", e.response?.data || e.message);
    }
}

async function gerarLicenca(email, nome, tipo) {
    console.log(`Chamando API Generate License para ${email} (${tipo})`);
    try {
        const res = await axios.post('https://control.zaplink.net/api/generate_license', {
            token: process.env.ZAPLINK_TOKEN,
            name: `${nome} (${tipo})`,
            email: email,
            product_id: "waoriginal"
        });
        console.log("Resposta Zaplink (Licença):", res.data);
    } catch (e) {
        console.error("Erro Zaplink (Licença):", e.response?.data || e.message);
    }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));