// --- VALORES REAIS DE PRODUÇÃO ---
if (valor >= 239.00) {
    await criarAdmin(email, nome, senha, 999999);
    entregasTemporarias[email] = { cota: "Ilimitada" };
} else if (valor >= 139.00) {
    await criarAdmin(email, nome, senha, 50);
    entregasTemporarias[email] = { cota: "50" };
} else if (valor >= 59.00) { // Voltar para 59.00
    await criarAdmin(email, nome, senha, 10);
    entregasTemporarias[email] = { cota: "10" };
} else {
    const tipo = valor >= 49.00 ? "VITALICIA" : "ANUAL";
    const chave = await gerarLicenca(email, nome, tipo);
    entregasTemporarias[email] = { chave: chave };
}