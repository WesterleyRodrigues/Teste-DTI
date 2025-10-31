import React, { useState, useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Ícones personalizados para heliponto, pedidos e drones
const helipontoIcon = new L.Icon({ iconUrl: "https://cdn-icons-png.flaticon.com/512/684/684908.png", iconSize: [30, 30] });
const pedidoIcon = new L.Icon({ iconUrl: "https://cdn-icons-png.flaticon.com/512/1040/1040230.png", iconSize: [25, 25] });
const droneIcon = new L.Icon({ iconUrl: "https://cdn-icons-png.flaticon.com/512/2274/2274681.png", iconSize: [34, 34], iconAnchor: [17, 17] });

function App() {
  // URL do backend e coordenadas do centro do mapa
  const backendUrl = "http://localhost:5216";
  const centroLat = -19.9227;
  const centroLng = -43.9378;

  // Estados principais: pedidos, novo pedido, alocações, erros, drones e specs
  const [pedidos, setPedidos] = useState([]);
  const [novoPedido, setNovoPedido] = useState({ x: "", y: "", peso: "", prioridade: "baixa" });
  const [alocacoes, setAlocacoes] = useState([]);
  const [erros, setErros] = useState({ x: "", y: "", peso: "" });

  // Estado e dados dos drones
  const [drones, setDrones] = useState([
    { nome: "Drone 1", lat: centroLat, lng: centroLng, status: "disponivel", filaDeViagens: [], route: null },
    { nome: "Drone 2", lat: centroLat, lng: centroLng, status: "disponivel", filaDeViagens: [], route: null },
    { nome: "Drone 3", lat: centroLat, lng: centroLng, status: "disponivel", filaDeViagens: [], route: null }
  ]);

  const [droneSpecs, setDroneSpecs] = useState({
    "Drone 1": { velocidadeKmH: 35 },
    "Drone 2": { velocidadeKmH: 35 },
    "Drone 3": { velocidadeKmH: 35 }
  });

  // Refs para controlar drones, animações e entregas
  const dronesRef = useRef(drones);
  const viagemRefs = useRef({});
  const rafRefs = useRef({});
  const entreguesRef = useRef(new Set());

  // Atualiza a ref sempre que o estado drones muda
  useEffect(() => { dronesRef.current = drones; }, [drones]);

  // Carrega dados iniciais: pedidos e specs dos drones
  useEffect(() => { carregarPedidos(); carregarSpecs(); }, []);

  // Função para carregar pedidos do backend
  async function carregarPedidos() {
    try {
      const res = await fetch(`${backendUrl}/pedidos`);
      if (!res.ok) throw new Error("Erro ao carregar pedidos");
      const dados = await res.json();
      setPedidos(dados);
    } catch (err) {
      console.error(err);
      alert("Não foi possível carregar os pedidos.");
    }
  }

  // Função para carregar especificações dos drones
  async function carregarSpecs() {
    try {
      const res = await fetch(`${backendUrl}/drones`);
      if (!res.ok) throw new Error("Sem endpoint /drones");
      const dados = await res.json();
      const mapa = {};
      dados.forEach(d => { if (d.Nome) mapa[d.Nome] = { velocidadeKmH: d.VelocidadeKmH ?? 35 }; });
      if (Object.keys(mapa).length > 0) setDroneSpecs(mapa);
    } catch {}
  }

  // Função para adicionar um novo pedido
  async function adicionarPedido() {
    const { x, y, peso } = novoPedido;
    const novosErros = { x: "", y: "", peso: "" };
    let valido = true;

    // Validação dos campos do pedido
    if (!x.trim()) { novosErros.x = "Campo obrigatório"; valido = false; }
    else if (x.length > 2 || isNaN(x)) { novosErros.x = "Máximo 2 dígitos numéricos"; valido = false; }

    if (!y.trim()) { novosErros.y = "Campo obrigatório"; valido = false; }
    else if (y.length > 2 || isNaN(y)) { novosErros.y = "Máximo 2 dígitos numéricos"; valido = false; }

    if (!peso.trim()) { novosErros.peso = "Campo obrigatório"; valido = false; }
    else if (peso.length > 2 || isNaN(peso)) { novosErros.peso = "Máximo 2 dígitos numéricos"; valido = false; }

    setErros(novosErros);
    if (!valido) return;

    try {
      const res = await fetch(`${backendUrl}/pedidos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ x: x.trim(), y: y.trim(), peso: peso.trim(), prioridade: novoPedido.prioridade })
      });
      if (!res.ok) { const txt = await res.text(); alert(txt); return; }
      alert("Pedido adicionado com sucesso!");
      setNovoPedido({ x: "", y: "", peso: "", prioridade: "baixa" });
      setErros({ x: "", y: "", peso: "" });
      await carregarPedidos();
    } catch (err) {
      console.error(err);
      alert("Erro ao adicionar o pedido.");
    }
  }

  // Função para alocar pedidos entre drones
  async function alocarPedidos() {
    if (pedidos.length === 0) { alert("Não há pedidos para alocar!"); return; }
    try {
      const res = await fetch(`${backendUrl}/alocar`);
      if (!res.ok) throw new Error("Erro ao alocar pedidos");
      const dados = await res.json();
      setAlocacoes(dados);
      processarAlocacoesParaViagens(dados);
    } catch (err) {
      console.error(err);
      alert("Erro ao alocar os pedidos.");
    }
  }

  // Converte coordenadas de pedido para latitude/longitude do mapa
  function pedidoParaLatLng(x, y) {
    const lat = centroLat + (parseFloat(y) - 10) * 0.005;
    const lng = centroLng + (parseFloat(x) - 10) * 0.005;
    return { lat, lng };
  }

  // Função para aguardar alguns milissegundos
  function esperarMs(ms) { return new Promise(res => setTimeout(res, ms)); }

  // Cancela todas animações de drones
  function limparRAF() {
    Object.values(rafRefs.current).forEach(id => cancelAnimationFrame(id));
    rafRefs.current = {};
    viagemRefs.current = {};
  }

  // Processa alocações recebidas e organiza viagens para cada drone
  function processarAlocacoesParaViagens(alocs) {
    limparRAF();
    const porDrone = {};
    let currentDrone = null;

    // Itera pelas linhas de alocação para separar por drone e por viagem
    for (let i = 0; i < alocs.length; i++) {
      const linha = alocs[i];
      if (!linha || typeof linha !== "string") continue;

      const headerMatch = linha.match(/^(.*Drone \d).*Total de pedidos/);
      if (headerMatch) { currentDrone = headerMatch[1].trim(); porDrone[currentDrone] = porDrone[currentDrone] || []; continue; }

      const viagemMatch = linha.match(/Viagem\s*\d+/i);
      if (viagemMatch && currentDrone) { porDrone[currentDrone] = porDrone[currentDrone] || []; porDrone[currentDrone].push([]); continue; }

      const pedidoMatch = linha.match(/Pedido[:\s]*\(?\s*([\d.]+)\s*,\s*([\d.]+)\s*\)?/i);
      if (pedidoMatch && currentDrone) {
        const x = parseFloat(pedidoMatch[1]); const y = parseFloat(pedidoMatch[2]);
        const key = `${x},${y}`;
        if (entreguesRef.current.has(key)) continue;
        const latlng = pedidoParaLatLng(x, y);
        porDrone[currentDrone] = porDrone[currentDrone] || [];
        if (porDrone[currentDrone].length === 0) porDrone[currentDrone].push([]);
        porDrone[currentDrone][porDrone[currentDrone].length - 1].push({ x, y, lat: latlng.lat, lng: latlng.lng });
        continue;
      }
    }

    // Cria fila de viagens de cada drone baseado nas alocações
    for (const linha of alocs) {
      const m = linha && linha.match(/Pedido \(?\s*([\d.]+)\s*,\s*([\d.]+)\s*\)? .*-> (Drone \d)/);
      if (m) {
        const x = parseFloat(m[1]); const y = parseFloat(m[2]); const droneNome = m[3].trim();
        const key = `${x},${y}`;
        if (entreguesRef.current.has(key)) continue;
        const latlng = pedidoParaLatLng(x, y);
        porDrone[droneNome] = porDrone[droneNome] || [];
        if (porDrone[droneNome].length === 0) porDrone[droneNome].push([{ x, y, lat: latlng.lat, lng: latlng.lng }]);
        else {
          if (porDrone[droneNome][porDrone[droneNome].length - 1].length === 0) {
            porDrone[droneNome][porDrone[droneNome].length - 1].push({ x, y, lat: latlng.lat, lng: latlng.lng });
          } else {
            porDrone[droneNome].push([{ x, y, lat: latlng.lat, lng: latlng.lng }]);
          }
        }
      }
    }

    // Atualiza estado dos drones com suas filas de viagens
    setDrones(prev => prev.map(d => ({ ...d, filaDeViagens: porDrone[d.nome] || [] })));

    // Inicia processamento das filas de cada drone
    setTimeout(() => {
      Object.keys(porDrone).forEach(nome => {
        const fila = (porDrone[nome] || []);
        if (fila.length > 0 && !viagemRefs.current[nome]) {
          processarFilaDoDrone(nome).catch(err => console.error("processarFilaDoDrone:", err));
        }
      });
    }, 0);
  }

  // Processa animação de voo do drone pelas viagens
  async function processarFilaDoDrone(droneNome) {
    if (viagemRefs.current[droneNome]) return;
    viagemRefs.current[droneNome] = true;

    try {
      while (true) {
        const dronesAtual = dronesRef.current || [];
        const d = dronesAtual.find(x => x.nome === droneNome);
        if (!d) break;

        // Se não houver viagens, drone fica disponível
        if (!d.filaDeViagens || d.filaDeViagens.length === 0) {
          setDrones(prev => prev.map(dd => dd.nome === droneNome ? { ...dd, status: "disponivel", route: null } : dd));
          await esperarMs(20);
          break;
        }

        const proximaViagem = d.filaDeViagens[0];
        if (!proximaViagem || proximaViagem.length === 0) {
          setDrones(prev => prev.map(dd => dd.nome === droneNome ? { ...dd, filaDeViagens: dd.filaDeViagens.slice(1) } : dd));
          await esperarMs(20);
          continue;
        }

        setDrones(prev => prev.map(dd => dd.nome === droneNome ? { ...dd, status: "em_missao" } : dd));
        await esperarMs(20);

        const waypoints = [{ lat: centroLat, lng: centroLng }].concat(
          proximaViagem.map(p => ({ lat: p.lat, lng: p.lng, pedido: p }))
        ).concat([{ lat: centroLat, lng: centroLng }]);

        // Anima drone para cada ponto da rota
        for (let i = 0; i < waypoints.length - 1; i++) {
          const origem = waypoints[i];
          const destino = waypoints[i + 1];

          await animarVooComVelocidade(droneNome, { lat: origem.lat, lng: origem.lng }, { lat: destino.lat, lng: destino.lng }, droneSpecs[droneNome]?.velocidadeKmH ?? 35);

          if (destino.pedido) {
            const px = destino.pedido.x ?? destino.pedido.X;
            const py = destino.pedido.y ?? destino.pedido.Y;
            entreguesRef.current.add(`${px},${py}`);
            await esperarMs(800); // pausa após entregar
          } else {
            await esperarMs(200); // pausa entre pontos
          }
        }

        setDrones(prev => prev.map(dd => dd.nome === droneNome ? { ...dd, filaDeViagens: dd.filaDeViagens.slice(1) } : dd));
        await esperarMs(50);

        const depois = (dronesRef.current || []).find(x => x.nome === droneNome);
        const filaRestante = depois?.filaDeViagens?.length ?? 0;
        if (filaRestante === 0) {
          setDrones(prev => prev.map(dd => dd.nome === droneNome ? { ...dd, status: "disponivel", route: null } : dd));
          await esperarMs(20);
        } else {
          setDrones(prev => prev.map(dd => dd.nome === droneNome ? { ...dd, status: "em_missao" } : dd));
          await esperarMs(10);
        }
      }
    } catch (err) {
      console.error("Erro em processarFilaDoDrone", droneNome, err);
    } finally {
      viagemRefs.current[droneNome] = false;
      setDrones(prev => prev.map(dd => dd.nome === droneNome ? { ...dd, status: "disponivel", route: null } : dd));
    }
  }

  // Funções auxiliares para cálculo de distância
  function degreesToRadians(deg) { return deg * Math.PI / 180.0; }
  function haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371.0;
    const dLat = degreesToRadians(lat2 - lat1);
    const dLon = degreesToRadians(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(degreesToRadians(lat1)) * Math.cos(degreesToRadians(lat2)) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
  function calcularDistanciaKm(origemLat, origemLng, destinoLat, destinoLng) {
    return haversineKm(origemLat, origemLng, destinoLat, destinoLng);
  }

  // Anima o voo do drone entre dois pontos considerando velocidade
  function animarVooComVelocidade(nome, origem, destino, velocidadeKmH) {
    if (rafRefs.current[nome]) { cancelAnimationFrame(rafRefs.current[nome]); delete rafRefs.current[nome]; }

    return new Promise(resolve => {
      const distanciaKm = calcularDistanciaKm(origem.lat, origem.lng, destino.lat, destino.lng);
      const tempoSeg = Math.max(0.2, (distanciaKm / Math.max(0.1, velocidadeKmH)) * 3600);
      const durationMs = tempoSeg * 1000;
      const startTime = performance.now();

      setDrones(prev => prev.map(d => d.nome === nome ? { ...d, route: [[origem.lat, origem.lng], [destino.lat, destino.lng]] } : d));

      function frame(now) {
        const elapsed = now - startTime;
        const t = Math.min(1, elapsed / durationMs);
        const lat = origem.lat + (destino.lat - origem.lat) * t;
        const lng = origem.lng + (destino.lng - origem.lng) * t;

        setDrones(prev => prev.map(d => d.nome === nome ? { ...d, lat, lng } : d));

        if (t >= 1) {
          setTimeout(() => setDrones(prev => prev.map(d => d.nome === nome ? { ...d, route: null } : d)), 200);
          if (rafRefs.current[nome]) { cancelAnimationFrame(rafRefs.current[nome]); delete rafRefs.current[nome]; }
          resolve();
          return;
        }
        rafRefs.current[nome] = requestAnimationFrame(frame);
      }

      rafRefs.current[nome] = requestAnimationFrame(frame);
    });
  }

  // Limpa RAF ao desmontar componente
  useEffect(() => { return () => { limparRAF(); }; }, []);

  // Render do app com formulário, lista de pedidos e mapa
  return (
    <div style={{ padding: 18, fontFamily: "Segoe UI, Roboto, sans-serif" }}>
      <h2>📦 Sistema de Entregas por Drone (rota encadeada)</h2>

      <p style={{ marginBottom: 12, color: "#444" }}>
        Nossos drones têm capacidade máxima de carga de 10 kg e autonomia de 15 km.
      </p>

      {/* Formulário de novo pedido */}
      <div style={{ marginBottom: 12 }}>
        <h3>Novo Pedido</h3>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}>
          <input placeholder="X" value={novoPedido.x} onChange={e => setNovoPedido({ ...novoPedido, x: e.target.value })} maxLength={2} style={{ width: 64, borderColor: erros.x ? "red" : undefined }} />
          <input placeholder="Y" value={novoPedido.y} onChange={e => setNovoPedido({ ...novoPedido, y: e.target.value })} maxLength={2} style={{ width: 64, borderColor: erros.y ? "red" : undefined }} />
          <input placeholder="Peso (kg)" value={novoPedido.peso} onChange={e => setNovoPedido({ ...novoPedido, peso: e.target.value })} maxLength={2} style={{ width: 96, borderColor: erros.peso ? "red" : undefined }} />
          <select value={novoPedido.prioridade} onChange={e => setNovoPedido({ ...novoPedido, prioridade: e.target.value })}>
            <option value="baixa">Baixa</option><option value="media">Média</option><option value="alta">Alta</option>
          </select>
          <button onClick={adicionarPedido}>Adicionar Pedido</button>
        </div>
      </div>

      <hr />

      {/* Lista de pedidos */}
      <div style={{ marginBottom: 12 }}>
        <h3>Pedidos Registrados</h3>
        <div style={{ marginBottom: 8 }}>
          <button onClick={carregarPedidos} style={{ marginRight: 8 }}>Atualizar Pedidos</button>
          <button onClick={alocarPedidos}>Alocar Pedidos (buscar /alocar)</button>
        </div>
        <ul>
          {pedidos.map((p, i) => {
            const pos = pedidoParaLatLng(p.x ?? p.X, p.y ?? p.Y);
            const key = `${p.x ?? p.X},${p.y ?? p.Y}`;
            const entregue = entreguesRef.current.has(key);
            return <li key={i}>Pedido {i + 1} — ({p.x ?? p.X}, {p.y ?? p.Y}) — {p.peso ?? p.Peso}kg — {p.prioridade ?? p.Prioridade} — <strong>{entregue ? "Entregue" : "Pendente"}</strong></li>;
          })}
        </ul>
      </div>

      <hr />

      {/* Mapa com drones e pedidos */}
      <div>
        <h3>🗺️ Mapa com Drones</h3>
        <MapContainer center={[centroLat, centroLng]} zoom={15} style={{ height: 520, width: "100%" }}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

          <Marker position={[centroLat, centroLng]} icon={helipontoIcon}>
            <Popup>🚁 Heliponto Central - Mercado Novo</Popup>
          </Marker>

          {pedidos.map((p, i) => {
            const pos = pedidoParaLatLng(p.x ?? p.X, p.y ?? p.Y);
            const key = `${p.x ?? p.X},${p.y ?? p.Y}`;
            const entregue = entreguesRef.current.has(key);
            return (
              <Marker key={`pedido-${i}`} position={[pos.lat, pos.lng]} icon={pedidoIcon}>
                <Popup>
                  Pedido {i + 1}<br />
                  ({p.x ?? p.X}, {p.y ?? p.Y}) — {p.peso ?? p.Peso}kg — Prioridade: {p.prioridade ?? p.Prioridade}<br />
                  <strong>{entregue ? "Entregue" : "Pendente"}</strong>
                </Popup>
              </Marker>
            );
          })}

          {drones.map((d, i) => (
            <React.Fragment key={`drone-${i}`}>
              <Marker position={[d.lat, d.lng]} icon={droneIcon}>
                <Popup>
                  {d.nome}<br />
                  Status: {d.status === "em_missao" ? "Em missão" : "Disponível"}<br />
                  Viagens na fila: {d.filaDeViagens.length}
                </Popup>
              </Marker>
              {d.route && <Polyline positions={d.route} pathOptions={{ color: "blue", weight: 3, dashArray: "5,8" }} />}
            </React.Fragment>
          ))}
        </MapContainer>
      </div>

      <hr />

      {/* Exibe alocações recebidas */}
      <div>
        <h3>Alocações recebidas</h3>
        {alocacoes.length > 0 ? (
          <ul>
            {alocacoes.map((a, i) => <li key={i} style={{ whiteSpace: "pre-wrap" }}>{a}</li>)}
          </ul>
        ) : (
          <p>Nenhuma alocação ainda. Clique em "Alocar Pedidos".</p>
        )}
      </div>
    </div>
  );
}

export default App;
