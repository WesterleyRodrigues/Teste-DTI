# 🚀 Sistema Inteligente de Entregas por Drones

Simulação completa de entregas urbanas feitas por **drones autônomos**, com **backend em .NET 8** e **frontend em React**.  
O projeto foi desenvolvido como um **teste técnico** para demonstrar lógica, organização e integração entre sistemas.

---

## 🧭 Visão Geral

A proposta é simular o funcionamento de uma startup de logística que realiza entregas em uma cidade mapeada por coordenadas (X, Y).  
O sistema gerencia **pedidos**, **drones** e **rotas de voo**, garantindo entregas dentro dos limites de **peso**, **distância** e **prioridade**.

---

## ⚙️ Funcionalidades Principais

✅ Cadastro de pedidos com:
- Localização (coordenadas X, Y)
- Peso do pacote
- Prioridade da entrega (baixa, média, alta)

✅ Alocação automática dos pedidos:
- Cada drone possui capacidade máxima (kg) e alcance (km)
- O algoritmo escolhe a melhor combinação com base em distância e prioridade

✅ Visualização no mapa:
- Exibe pedidos, posições e voos dos drones em tempo real

✅ Interface simples e responsiva (React)

---

🔹 Tecnologias

Backend:

.NET 8 (C#)

WebApplication minimal API

CORS habilitado para comunicação com frontend

Frontend:
React.js
React-Leaflet para mapas interativos
Fetch API para comunicação com o backend

🔹 Pré-requisitos
.NET 8 SDK
Node.js (v18 ou superior recomendado)
npm ou yarn

🔹 Como Executar
Backend
Abra o terminal na pasta do backend.
Execute o comando:
dotnet run

O backend ficará disponível em http://localhost:5216.

Endpoints principais:

Método	Rota	Descrição
GET	/pedidos	Retorna todos os pedidos
POST	/pedidos	Adiciona um novo pedido
GET	/alocar	Aloca pedidos aos drones

Observação: Certifique-se de que o backend esteja rodando antes de iniciar o frontend.

Frontend

Abra o terminal na pasta do frontend.

Instale as dependências:

npm install

Inicie o frontend:

npm start


O frontend será aberto em http://localhost:3000.

🔹 Como Usar

Adicione novos pedidos preenchendo os campos X, Y, Peso e Prioridade.
Clique em Adicionar Pedido.
Para alocar pedidos entre drones, clique em Alocar Pedidos.
Acompanhe o movimento dos drones no mapa interativo:
Heliponto central marcado
Pedidos pendentes ou entregues
Drones com status "Disponível" ou "Em missão"
