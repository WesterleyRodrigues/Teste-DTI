using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;

// Configuração básica do WebApplication e habilitação de CORS
var builder = WebApplication.CreateBuilder(args);
builder.Services.AddCors();

var app = builder.Build();

app.UseCors(x => x
    .AllowAnyOrigin()
    .AllowAnyMethod()
    .AllowAnyHeader()
);

// Inicializa listas de pedidos e drones disponíveis
List<Pedido> pedidos = new();
List<Drone> drones = new()
{
    new Drone { Nome = "Drone 1", CapacidadeKg = 10, DistanciaMaxKm = 30, VelocidadeKmH = 35 },
    new Drone { Nome = "Drone 2", CapacidadeKg = 5, DistanciaMaxKm = 20, VelocidadeKmH = 35 },
    new Drone { Nome = "Drone 3", CapacidadeKg = 2, DistanciaMaxKm = 10, VelocidadeKmH = 35 }
};

// Endpoint GET para listar todos os pedidos
app.MapGet("/pedidos", () => pedidos);

// Endpoint POST para adicionar um novo pedido
app.MapPost("/pedidos", (PedidoInput input) =>
{
    // Valida tamanho dos campos
    if (input.X.Length > 2 || input.Y.Length > 2 || input.Peso.Length > 2)
        return Results.BadRequest("Erro: Os campos X, Y e Peso devem ter no máximo 2 caracteres.");

    // Valida se os campos são números
    if (!double.TryParse(input.X, out double x) ||
        !double.TryParse(input.Y, out double y) ||
        !double.TryParse(input.Peso, out double peso))
    {
        return Results.BadRequest("Erro: Os campos X, Y e Peso devem conter apenas números.");
    }

    // Valida se os valores são positivos
    if (x < 0 || y < 0 || peso <= 0)
        return Results.BadRequest("Erro: Campos inválidos. Verifique se os valores são números positivos.");

    // Cria objeto Pedido
    var novoPedido = new Pedido
    {
        X = x,
        Y = y,
        Peso = peso,
        Prioridade = input.Prioridade
    };

    // Calcula distância do heliponto central e verifica drones disponíveis
    double distanciaKm = DistanciaDoHelipontoKm(novoPedido.X, novoPedido.Y);
    var dronesPossiveis = drones.Where(d => novoPedido.Peso <= d.CapacidadeKg && distanciaKm <= d.DistanciaMaxKm).ToList();

    // Se nenhum drone puder atender, retorna erro detalhado
    if (dronesPossiveis.Count == 0)
    {
        bool pesoInvalido = drones.All(d => novoPedido.Peso > d.CapacidadeKg);
        bool distanciaInvalida = drones.All(d => distanciaKm > d.DistanciaMaxKm);

        if (pesoInvalido && distanciaInvalida)
            return Results.BadRequest($"Erro: Nenhum drone pode atender. Peso ({novoPedido.Peso}kg) e distância ({distanciaKm:F2}km) excedem a capacidade e alcance máximos.");
        else if (pesoInvalido)
            return Results.BadRequest($"Erro: Nenhum drone pode carregar {novoPedido.Peso}kg. Peso excede a capacidade máxima dos drones.");
        else if (distanciaInvalida)
            return Results.BadRequest($"Erro: Nenhum drone alcança {distanciaKm:F2}km. Distância excede o alcance máximo dos drones.");
        else
            return Results.BadRequest($"Erro: Nenhum drone disponível para peso {novoPedido.Peso}kg e distância {distanciaKm:F2}km.");
    }

    // Adiciona pedido à lista
    pedidos.Add(novoPedido);
    return Results.Ok(novoPedido);
});

// Endpoint GET para alocar pedidos aos drones
app.MapGet("/alocar", () =>
{
    var alocacoes = new List<string>();

    // Configurações de limite por viagem e penalidades
    int maxPedidosPorViagem = 3; 
    int maxPedidosPorPasse = 4;  
    double alphaPenalidade = 0.9; 

    // Ordena pedidos por prioridade
    var pedidosOrdenados = pedidos
        .Where(p => !string.IsNullOrEmpty(p.Prioridade))
        .OrderByDescending(p => PrioridadeValor(p.Prioridade))
        .ToList();

    var pedidosAlocadosGlobal = new HashSet<Pedido>();

    // Inicializa dados dos drones antes da alocação
    foreach (var drone in drones)
    {
        drone.ViagemAtual = new();
        drone.DistanciaPercorrida = 0;
        drone.Viagens = new();
        drone.TempoDisponivelEmHoras = 0;
    }

    // Função para encontrar a melhor viagem para um drone
    (List<Pedido>? melhor, double distanciaKm) MelhorViagemParaDrone(List<Pedido> pedidosDisponiveis, Drone drone)
    {
        double distancia = 0;
        List<Pedido>? melhor = null;
        double melhorPeso = 0;
        double melhorDist = double.MaxValue;

        var todasCombinacoes = GerarCombinacoesLimitadas(pedidosDisponiveis, maxPedidosPorViagem);
        foreach (var combinacao in todasCombinacoes)
        {
            double pesoTotal = combinacao.Sum(p => p.Peso);
            if (pesoTotal > drone.CapacidadeKg) continue;

            double distRota = CalcularMenorRotaKmParaCombinacao(combinacao);
            if (distRota > drone.DistanciaMaxKm) continue;

            if (pesoTotal > melhorPeso || (Math.Abs(pesoTotal - melhorPeso) < 1e-6 && distRota < melhorDist))
            {
                melhorPeso = pesoTotal;
                melhorDist = distRota;
                melhor = combinacao;
                distancia = distRota;
            }
        }

        return (melhor, distancia);
    }

    var perPassAssigned = drones.ToDictionary(d => d, d => 0);

    // Loop principal para alocação de pedidos
    while (true)
    {
        var candidatos = new List<(Drone drone, List<Pedido> viagem, double distKm)>();
        var pedidosDisponiveisAgora = pedidosOrdenados.Where(p => !pedidosAlocadosGlobal.Contains(p)).ToList();
        if (pedidosDisponiveisAgora.Count == 0) break;

        foreach (var drone in drones)
        {
            if (perPassAssigned[drone] >= maxPedidosPorPasse) continue;

            var resultado = MelhorViagemParaDrone(pedidosDisponiveisAgora, drone);
            var melhor = resultado.melhor;
            var distKm = resultado.distanciaKm;

            if (melhor != null && melhor.Count > 0)
            {
                candidatos.Add((drone, melhor, distKm));
                Console.WriteLine($"CANDIDATO: {drone.Nome} peso={melhor.Sum(p=>p.Peso):F2} distKm={distKm:F2} viagens={drone.Viagens.Count} tempoDisp={drone.TempoDisponivelEmHoras:F2} pedidosNoPass={perPassAssigned[drone]}");
            }
        }

        if (candidatos.Count == 0) break;

        // Escolhe melhor candidato global considerando peso, distância e penalidade
        var melhorGlobal = candidatos
            .Select(c => new
            {
                c.drone,
                c.viagem,
                c.distKm,
                tempoViagemHoras = c.distKm / c.drone.VelocidadeKmH,
                fimEstimado = c.drone.TempoDisponivelEmHoras + (c.distKm / c.drone.VelocidadeKmH),
                peso = c.viagem.Sum(p => p.Peso),
                penalizado = (c.drone.TempoDisponivelEmHoras + (c.distKm / c.drone.VelocidadeKmH)) + alphaPenalidade * c.drone.Viagens.Count
            })
            .OrderBy(x => x.penalizado)
            .ThenByDescending(x => x.peso)
            .ThenBy(x => x.distKm)
            .First();

        var droneEscolhido = melhorGlobal.drone;
        var viagemEscolhida = melhorGlobal.viagem;
        double distanciaViagem = melhorGlobal.distKm;
        double tempoViagemHoras = distanciaViagem / droneEscolhido.VelocidadeKmH;

        // Ajusta pedidos se exceder limite por passe
        if (perPassAssigned[droneEscolhido] + viagemEscolhida.Count > maxPedidosPorPasse)
        {
            var cabe = new List<Pedido>();
            foreach (var p in viagemEscolhida.OrderByDescending(p => PrioridadeValor(p.Prioridade)).ThenByDescending(p => p.Peso))
            {
                if (perPassAssigned[droneEscolhido] + cabe.Count + 1 <= maxPedidosPorPasse)
                    cabe.Add(p);
            }
            if (cabe.Count == 0)
            {
                perPassAssigned[droneEscolhido] = maxPedidosPorPasse;
                continue;
            }
            viagemEscolhida = cabe;
            distanciaViagem = CalcularMenorRotaKmParaCombinacao(viagemEscolhida);
            tempoViagemHoras = distanciaViagem / droneEscolhido.VelocidadeKmH;
        }

        // Atualiza dados do drone com a viagem escolhida
        droneEscolhido.ViagemAtual.AddRange(viagemEscolhida);
        droneEscolhido.Viagens.Add(viagemEscolhida);
        droneEscolhido.DistanciaPercorrida += distanciaViagem;
        droneEscolhido.TempoDisponivelEmHoras += tempoViagemHoras;

        // Marca pedidos como alocados e adiciona registro de alocação
        foreach (var pedido in viagemEscolhida)
        {
            pedidosAlocadosGlobal.Add(pedido);
            alocacoes.Add($"Pedido ({pedido.X},{pedido.Y}) de {pedido.Peso}kg -> {droneEscolhido.Nome}");
            perPassAssigned[droneEscolhido] += 1;
        }

        Console.WriteLine($"APLICADO: {droneEscolhido.Nome} recebeu {viagemEscolhida.Count} pedido(s), totalRecebidoNestePass={perPassAssigned[droneEscolhido]}, totalViagens={droneEscolhido.Viagens.Count}");
    }

    // Aloca pedidos restantes individualmente
    var pedidosRestantes = pedidosOrdenados.Where(p => !pedidosAlocadosGlobal.Contains(p)).ToList();

    foreach (var pedido in pedidosRestantes)
    {
        Drone? melhorDrone = null;
        double melhorFim = double.MaxValue;
        double melhorDist = 0;

        foreach (var drone in drones)
        {
            if (pedido.Peso > drone.CapacidadeKg) continue;

            double distKm = CalcularMenorRotaKmParaCombinacao(new List<Pedido> { pedido });
            if (distKm > drone.DistanciaMaxKm) continue;

            double tempoAdicional = distKm / drone.VelocidadeKmH;
            double fimEstimado = drone.TempoDisponivelEmHoras + tempoAdicional;

            double fimPenalizado = fimEstimado + alphaPenalidade * drone.Viagens.Count;

            if (fimPenalizado < melhorFim || (Math.Abs(fimPenalizado - melhorFim) < 1e-9 && distKm < melhorDist))
            {
                melhorFim = fimPenalizado;
                melhorDrone = drone;
                melhorDist = distKm;
            }
        }

        if (melhorDrone != null)
        {
            melhorDrone.ViagemAtual.Add(pedido);
            melhorDrone.Viagens.Add(new List<Pedido> { pedido });
            melhorDrone.DistanciaPercorrida += melhorDist;
            melhorDrone.TempoDisponivelEmHoras += (melhorDist / melhorDrone.VelocidadeKmH);

            pedidosAlocadosGlobal.Add(pedido);
            alocacoes.Add($"Pedido ({pedido.X},{pedido.Y}) de {pedido.Peso}kg -> {melhorDrone.Nome}");
        }
        else
        {
            alocacoes.Add($"Pedido ({pedido.X},{pedido.Y}) de {pedido.Peso}kg -> Nenhum drone disponível");
        }
    }

    // Adiciona resumo das viagens de cada drone
    foreach (var drone in drones)
    {
        alocacoes.Add($"\n{drone.Nome} - Total de pedidos: {drone.ViagemAtual.Count} - Distância: {drone.DistanciaPercorrida:F2}km - Viagens realizadas: {drone.Viagens.Count}");

        double tempoTotalHoras = drone.TempoDisponivelEmHoras;
        int horas = (int)Math.Floor(tempoTotalHoras);
        int minutos = (int)Math.Round((tempoTotalHoras - horas) * 60);
        alocacoes.Add($"⏱️ Tempo total até estar livre: {horas}h {minutos}min");

        for (int i = 0; i < drone.Viagens.Count; i++)
        {
            alocacoes.Add($"  🧭 Viagem {i + 1}:");
            foreach (var pedido in drone.Viagens[i])
            {
                alocacoes.Add($"    → Pedido: ({pedido.X},{pedido.Y}) - {pedido.Peso}kg - Prioridade {pedido.Prioridade}");
            }
            double distViagem = CalcularMenorRotaKmParaCombinacao(drone.Viagens[i]);
            alocacoes.Add($"    Distância estimada viagem: {distViagem:F2}km");
        }
    }

    return alocacoes;
});

app.Run();

// Constantes do centro e escala do grid
const double CentroLat = -19.9227;
const double CentroLng = -43.9378;
const double ScaleDegPerUnit = 0.005; 

// Converte prioridade para valor numérico para ordenar
static double PrioridadeValor(string prioridade)
{
    return prioridade.ToLower() switch
    {
        "alta" => 3,
        "media" => 2,
        "baixa" => 1,
        _ => 0
    };
}

// Converte coordenadas do grid para latitude e longitude
static (double lat, double lng) GridParaLatLng(double x, double y)
{
    double lat = CentroLat + (y - 10.0) * ScaleDegPerUnit;
    double lng = CentroLng + (x - 10.0) * ScaleDegPerUnit;
    return (lat, lng);
}

// Calcula distância entre duas coordenadas usando Haversine
static double HaversineKm(double lat1, double lon1, double lat2, double lon2)
{
    double R = 6371.0;
    double dLat = DegreesToRadians(lat2 - lat1);
    double dLon = DegreesToRadians(lon2 - lon1);
    double a = Math.Sin(dLat/2) * Math.Sin(dLat/2) + Math.Cos(DegreesToRadians(lat1)) * Math.Cos(DegreesToRadians(lat2)) * Math.Sin(dLon/2) * Math.Sin(dLon/2);
    double c = 2 * Math.Atan2(Math.Sqrt(a), Math.Sqrt(1 - a));
    return R * c;
}

// Converte graus para radianos
static double DegreesToRadians(double deg) => deg * Math.PI / 180.0;

// Calcula distância do heliponto até coordenadas do pedido
static double DistanciaDoHelipontoKm(double x, double y)
{
    var (plat, plng) = GridParaLatLng(x, y);
    return HaversineKm(CentroLat, CentroLng, plat, plng);
}

// Calcula distância entre dois pedidos
static double DistanciaEntrePedidosKm(Pedido a, Pedido b)
{
    var (aLat, aLng) = GridParaLatLng(a.X, a.Y);
    var (bLat, bLng) = GridParaLatLng(b.X, b.Y);
    return HaversineKm(aLat, aLng, bLat, bLng);
}

// Calcula menor rota possível para uma combinação de pedidos
static double CalcularMenorRotaKmParaCombinacao(List<Pedido> combinacao)
{
    if (combinacao == null || combinacao.Count == 0) return 0.0;

    // Permuta todas as ordens para pequenas combinações
    if (combinacao.Count <= 7)
    {
        double melhor = double.MaxValue;
        foreach (var perm in Permutar(combinacao))
        {
            double dist = 0.0;
            var (lat0, lng0) = GridParaLatLng(perm[0].X, perm[0].Y);
            dist += HaversineKm(CentroLat, CentroLng, lat0, lng0);
            for (int i = 0; i < perm.Count - 1; i++)
            {
                dist += DistanciaEntrePedidosKm(perm[i], perm[i + 1]);
            }
            var (latLast, lngLast) = GridParaLatLng(perm[^1].X, perm[^1].Y);
            dist += HaversineKm(latLast, lngLast, CentroLat, CentroLng);
            if (dist < melhor) melhor = dist;
        }
        return melhor;
    }
    else
    {
        // Algoritmo aproximado para muitas entregas
        var remaining = new List<Pedido>(combinacao);
        var route = new List<Pedido>();
        remaining.Sort((a, b) => DistanciaDoHelipontoKm(a.X, a.Y).CompareTo(DistanciaDoHelipontoKm(b.X, b.Y)));
        var current = remaining[0];
        route.Add(current);
        remaining.RemoveAt(0);

        while (remaining.Count > 0)
        {
            int bestIdx = 0;
            double bestDist = DistanciaEntrePedidosKm(current, remaining[0]);
            for (int i = 1; i < remaining.Count; i++)
            {
                double d = DistanciaEntrePedidosKm(current, remaining[i]);
                if (d < bestDist) { bestDist = d; bestIdx = i; }
            }
            current = remaining[bestIdx];
            route.Add(current);
            remaining.RemoveAt(bestIdx);
        }

        double total = 0.0;
        var (latFirst, lngFirst) = GridParaLatLng(route[0].X, route[0].Y);
        total += HaversineKm(CentroLat, CentroLng, latFirst, lngFirst);
        for (int i = 0; i < route.Count - 1; i++)
        {
            total += DistanciaEntrePedidosKm(route[i], route[i + 1]);
        }
        var (latLast2, lngLast2) = GridParaLatLng(route[^1].X, route[^1].Y);
        total += HaversineKm(latLast2, lngLast2, CentroLat, CentroLng);
        return total;
    }
}

// Gera todas as permutações de uma lista
static IEnumerable<List<T>> Permutar<T>(List<T> lista)
{
    if (lista.Count == 1) yield return new List<T>(lista);
    else
    {
        for (int i = 0; i < lista.Count; i++)
        {
            var elem = lista[i];
            var restante = new List<T>(lista);
            restante.RemoveAt(i);
            foreach (var perm in Permutar(restante))
            {
                var nova = new List<T> { elem };
                nova.AddRange(perm);
                yield return nova;
            }
        }
    }
}

// Gera combinações limitadas de pedidos (até maxTamanho)
static List<List<Pedido>> GerarCombinacoesLimitadas(List<Pedido> pedidos, int maxTamanho)
{
    var resultado = new List<List<Pedido>>();
    int n = pedidos.Count;
    int limite = Math.Min(n, maxTamanho);

    for (int tamanho = 1; tamanho <= limite; tamanho++)
    {
        CombinarRec(pedidos, 0, tamanho, new List<Pedido>(), resultado);
    }

    return resultado;
}

// Função recursiva para gerar combinações
static void CombinarRec(List<Pedido> pedidos, int start, int tamanho, List<Pedido> atual, List<List<Pedido>> resultado)
{
    if (atual.Count == tamanho)
    {
        resultado.Add(new List<Pedido>(atual));
        return;
    }
    for (int i = start; i < pedidos.Count; i++)
    {
        atual.Add(pedidos[i]);
        CombinarRec(pedidos, i + 1, tamanho, atual, resultado);
        atual.RemoveAt(atual.Count - 1);
    }
}

// Classes do modelo de dados
public class PedidoInput
{
    public string X { get; set; } = "";
    public string Y { get; set; } = "";
    public string Peso { get; set; } = "";
    public string Prioridade { get; set; } = "baixa";
}

public class Pedido
{
    public double X { get; set; }
    public double Y { get; set; }
    public double Peso { get; set; }
    public string Prioridade { get; set; } = "baixa";
}

public class Drone
{
    public string Nome { get; set; } = "";
    public double CapacidadeKg { get; set; }
    public double DistanciaMaxKm { get; set; }
    public double VelocidadeKmH { get; set; } = 35;
    public List<Pedido> ViagemAtual { get; set; } = new();
    public double DistanciaPercorrida { get; set; } = 0;
    public double TempoDisponivelEmHoras { get; set; } = 0;
    public List<List<Pedido>> Viagens { get; set; } = new();
}
