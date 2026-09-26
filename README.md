# IABET — gateway preparado

Esta versão mantém o sandbox funcionando e acrescenta no Painel ADM uma área para configurar o gateway:

- Provedor
- API URL
- API Key
- Webhook Secret
- Chave para marcar/desmarcar operação real

As credenciais são mantidas no backend local (`data.json`) nesta versão de desenvolvimento e **não são expostas pela API de leitura**. Em produção, migre os segredos para um secret manager/variáveis de ambiente e criptografe dados sensíveis.

## Ponto de integração
O próximo adaptador de produção deve implementar:
- criação de cobrança/PIX no PSP
- retorno de QR/copia-e-cola
- webhook assinado e idempotente
- confirmação somente após status definitivo do PSP
- conciliação
- tratamento de estorno/chargeback quando aplicável

Não habilite `live` até testar o webhook, autenticação, idempotência, reconciliação, limites e controles regulatórios aplicáveis à operação de apostas e pagamentos.

## Rodar
Node.js 18+
`npm start`
Abra `http://localhost:3000`
