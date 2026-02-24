const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

// Rota de teste: Acesse seu-link.onrender.com/ no navegador para ver se está online
app.get('/', (req, res) => {
    res.send('Servidor de Licenças Rodando! 🚀');
});

// Rota que o Mercado Pago/Stripe vai chamar
app.post('/webhook', async (req, res) => {
    const pagamento = req.body;

    // Lógica simplificada: Se o status for 'approved' (Mercado Pago)
    if (pagamento.status === 'approved' || pagamento.type === 'payment.success') {
        
        // Pegamos os dados que o checkout nos enviou
        const clienteEmail = pagamento.payer?.email || pagamento.email;
        const clienteNome = pagamento.payer?.first_name || "Cliente Zaplink";

        try {
            // Chamada para a Zaplink
            const response = await axios.post('https://control.zaplink.net/api/generate_license', {
                token: process.env.ZAPLINK_TOKEN, // Fica escondido no Render
                name: clienteNome,
                email: clienteEmail,
                product_id: "waoriginal" // Troque pelo seu ID real
            });

            console.log('Sucesso! Licença gerada:', response.data.license_code);
        } catch (error) {
            console.error('Erro ao gerar licença na Zaplink:', error.message);
        }
    }

    // Respondemos 200 para o checkout não tentar enviar de novo
    res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Rodando na porta ${PORT}`));