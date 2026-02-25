const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

app.get('/', (req, res) => {
    res.send('<h1>Servidor WA Original Ativo!</h1>');
});

app.get('/sucesso', async (req, res) => {
    const idPagamento = req.query.payment_id;
    if (!idPagamento) return res.send("Aguardando confirmação...");
    try {
        const mpResponse = await axios.get(`https://api.mercadopago.com/v1/payments/${idPagamento}`, {
            headers: { 'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN.trim()}` }
        });
        const pagamento = mpResponse.data;
        const valor = pagamento.transaction_amount;
        const senhaPadrao = `Zap@${idPagamento.toString().slice(-4)}`;
        const email = pagamento.payer?.email || "seu e-mail de compra";

        if (pagamento.status === 'approved') {
            let titulo = valor >= 59.00 ? "Sua conta de Revendedor está pronta! 🚀" : "Sua Licença foi Gerada! ✅";
            let instrucoes = valor >= 59.00 ? `
                <p>Login: <a href="https://control.zaplink.net/">control.zaplink.net</a><br>
                E-mail: ${email}<br>
                Senha Provisória: <b>${senhaPadrao}</b></p>` : `<p>Enviada para: <b>${email}</b></p>`;

            res.send(`<div style="font-family:sans-serif;text-align:center;padding:40px;"><h1>${titulo}</h1>${instrucoes}<br><a href="https://wasenderbrasil.me">Voltar</a></div>`);
        } else {
            res.send("Processando... atualize a página.");
        }
    } catch (e) { res.send("Erro ao carregar dados."); }
});

app.post('/webhook', async (req, res) => {
    res.sendStatus(200);
    const body = req.body;
    console.log("-----------------------------------------");
    console.log("NOTIFICAÇÃO RECEBIDA:", JSON.stringify(body));

    // LÓGICA DE CAPTURA DE ID CORRIGIDA PARA O SEU CASO:
    let idPagamento = null;
    if (body.data && body.data.id) {
        idPagamento = body.data.id;
    } else if (body.resource) {
        // Extrai apenas os números do campo resource (ex: "147027194111")
        idPagamento = body.resource.toString().replace(/\D/g, "");
    } else if (body.id) {
        idPagamento = body.id;
    }

    if (!idPagamento || idPagamento === '123456789') {
        console.log("Aviso: Notificação ignorada (ID de teste ou vazio).");
        return;
    }

    try {
        console.log(`Buscando detalhes do pagamento: ${idPagamento}`);
        const mpResponse = await axios.get(`https://api.mercadopago.com/v1/payments/${idPagamento}`, {
            headers: { 'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN.trim()}` }
        });

        const p = mpResponse.data;
        if (p.status === 'approved') {
            const valor = p.transaction_amount;
            const email = (p.payer?.email || p.additional_info?.payer?.email || `cliente_${idPagamento}@mercadopago.com`).trim();
            const nome = p.payer?.first_name || "Cliente";
            const senha = `Zap@${idPagamento.toString().slice(-4)}`;

            console.log(`Aprovado! Valor: R$ ${valor}. Entregando...`);

            if (valor >= 239.00) await criarAdmin(email, nome, senha, 999999);
            else if (valor >= 139.00) await criarAdmin(email, nome, senha, 50);
            else if (valor >= 59.00) await criarAdmin(email, nome, senha, 10);
            else if (valor >= 49.00) await gerarLicenca(email, nome, "VITALICIA");
            else if (valor >= 1.00) await gerarLicenca(email, nome, "ANUAL");
            
            console.log(`Sucesso para ${email}`);
        } else {
            console.log(`Status do pagamento ${idPagamento}: ${p.status}`);
        }
    } catch (error) {
        console.error('Erro no processamento:', error.message);
    }
});

async function criarAdmin(email, nome, senha, cota) {
    try {
        await axios.post('https://control.zaplink.net/api/create_admin', {
            token: process.env.ZAPLINK_TOKEN,
            admin_email: email, admin_name: nome, admin_password: senha,
            admin_role: "admin", license_quota: cota, allowed_products: "waoriginal"
        });
    } catch (e) { console.error("Erro Zaplink Admin:", e.message); }
}

async function gerarLicenca(email, nome, tipo) {
    try {
        await axios.post('https://control.zaplink.net/api/generate_license', {
            token: process.env.ZAPLINK_TOKEN,
            name: `${nome} (${tipo})`, email: email, product_id: "waoriginal"
        });
    } catch (e) { console.error("Erro Zaplink Licença:", e.message); }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Rodando na porta ${PORT}`));