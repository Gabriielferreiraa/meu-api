const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

app.get('/', (req, res) => res.send('Sistema de Vendas Automatizado Ativo!'));

app.post('/webhook', async (req, res) => {
    res.sendStatus(200);
    const body = req.body;
    
    let idPagamento = body.data?.id || body.id;
    if (!idPagamento || idPagamento === '123456789') return;

    try {
        console.log(`--- Processando Pagamento: ${idPagamento} ---`);

        const mpResponse = await axios.get(`https://api.mercadopago.com/v1/payments/${idPagamento}`, {
            headers: { 'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN.trim()}` }
        });

        const pagamento = mpResponse.data;

        if (pagamento.status === 'approved') {
            const valor = pagamento.transaction_amount;
            const emailCliente = (pagamento.payer?.email || pagamento.additional_info?.payer?.email || `cliente_${idPagamento}@mercadopago.com`).trim();
            const nomeCliente = pagamento.payer?.first_name || "Cliente";
            const senhaPadrao = `Zap@${idPagamento.toString().slice(-4)}`;

            console.log(`Valor Identificado: R$ ${valor} | Cliente: ${emailCliente}`);

            // --- LÓGICA DE DISTRIBUIÇÃO POR PREÇO ---

            // 1. REVENDEDOR OURO (R$ 239,90) - ILIMITADO
            if (valor >= 239.00) {
                console.log("Pacote: Revendedor OURO (Ilimitado)");
                await criarAdmin(emailCliente, nomeCliente, senhaPadrao, 999999);
            } 
            // 2. REVENDEDOR PRATA (R$ 139,90) - 50 LICENÇAS
            else if (valor >= 139.00) {
                console.log("Pacote: Revendedor PRATA (50 Licenças)");
                await criarAdmin(emailCliente, nomeCliente, senhaPadrao, 50);
            }
            // 3. REVENDEDOR BRONZE (R$ 59,90) - 10 LICENÇAS
            else if (valor >= 59.00) {
                console.log("Pacote: Revendedor BRONZE (10 Licenças)");
                await criarAdmin(emailCliente, nomeCliente, senhaPadrao, 10);
            }
            // 4. LICENÇA VITALÍCIA (R$ 49,90)
            else if (valor >= 49.00) {
                console.log("Pacote: Licença Vitalícia");
                await gerarLicenca(emailCliente, nomeCliente, "VITALICIA");
            }
            // 5. LICENÇA ANUAL (R$ 29,90)
            else if (valor >= 29.00) {
                console.log("Pacote: Licença Anual");
                await gerarLicenca(emailCliente, nomeCliente, "ANUAL");
            }
            else {
                console.log("Valor não corresponde a nenhum pacote configurado.");
            }

            console.log(`✅ Processo finalizado para ${emailCliente}`);
        }
    } catch (error) {
        console.error('Erro no processamento:', error.message);
    }
});

// FUNÇÃO PARA CRIAR ADMINISTRADOR (REVENDEDORES)
async function criarAdmin(email, nome, senha, cota) {
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
        console.log(`Resultado Admin: ${res.data.message || "Sucesso"}`);
    } catch (err) {
        console.error("Erro ao criar admin:", err.response?.data || err.message);
    }
}

// FUNÇÃO PARA GERAR LICENÇA SIMPLES
async function gerarLicenca(email, nome, tipo) {
    try {
        const res = await axios.post('https://control.zaplink.net/api/generate_license', {
            token: process.env.ZAPLINK_TOKEN,
            name: `${nome} (${tipo})`,
            email: email,
            product_id: "waoriginal"
        });
        console.log(`Resultado Licença: ${res.data.status ? "Gerada com Sucesso" : "Erro na Zaplink"}`);
    } catch (err) {
        console.error("Erro ao gerar licença:", err.response?.data || err.message);
    }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));