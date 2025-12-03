Sistema de Entregas por Drones

Sistema web para simulação de entregas usando drones com capacidade de carga limitada, cálculo de rotas otimizadas e visualização em mapa.
Os drones pegam os pedidos em um heliponto central e entregam nos destinos, respeitando capacidade máxima, distância máxima e prioridade dos pedidos.

📝 Funcionalidades

Cadastro de novos pedidos com coordenadas X, Y, peso e prioridade.
Alocação automática de pedidos entre drones, considerando capacidade, distância e prioridade.
Simulação animada do trajeto dos drones no mapa.
Visualização em tempo real dos drones e pedidos.
Histórico de alocações e detalhes das viagens.

📂 Estrutura do Projeto

/backend
    /bin
    /obj
    /Properties
    appsettings.Development.json
    appsettings.json
    backend.sln
    BackendDrones.csproj
    global.json
    Program.cs

/frontend
    /node_modules
    /public
    /src
        App.js
        index.js
        
README.md

⚙️ Pré-requisitos

Antes de rodar o projeto, é necessário:

Node.js
 (v18+ recomendado)

npm
 (vem com Node.js)

.NET 8 SDK

🚀 Como Rodar
1. Clonar o repositório
git clone git clone https://github.com/WesterleyRodrigues/Delivery_Drones
cd Teste‑DTI

2. Rodar o Backend

cd backend
dotnet restore
dotnet run

O backend estará disponível em http://localhost:5216.

3. Rodar o Frontend

Em outro terminal:

cd frontend
npm install
npm start

O frontend abrirá em http://localhost:3000 e se conectará automaticamente ao backend.

🖥️ Como Usar

No frontend, preencha X, Y, Peso e Prioridade para adicionar um novo pedido.
Clique em Alocar Pedidos para distribuir os pedidos entre os drones.
Observe a movimentação dos drones no mapa em tempo real.
Consulte a lista de pedidos para ver quais já foram entregues.

⚠️ Observações

Sempre execute o backend antes do frontend.
As portas padrão são 5216 para o backend e 3000 para o frontend.
