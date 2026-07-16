using System;
using System.Collections.Generic;
using System.Linq;

namespace Kestrel.Sim;

public static class GameLoop
{
    private static readonly Dictionary<(string From, string To), int> RouteDays = new()
    {
        [("solace", "foundry")] = 3,
        [("foundry", "solace")] = 3
    };

    public const float FuelPerDay = 4f;
    public const int FoodPerDay = 1;

    public static bool SwapModules(GameState state, int slotA, int slotB)
    {
        var a = state.Ship.Modules.FirstOrDefault(module => module.Slot == slotA);
        var b = state.Ship.Modules.FirstOrDefault(module => module.Slot == slotB);
        if (a == null || b == null || ReferenceEquals(a, b)) return false;
        (a.Key, b.Key) = (b.Key, a.Key);
        (a.Powered, b.Powered) = (b.Powered, a.Powered);
        (a.Damaged, b.Damaged) = (b.Damaged, a.Damaged);
        (a.Mark, b.Mark) = (b.Mark, a.Mark);
        return true;
    }

    public static bool AcceptContract(GameState state, int contractId)
    {
        if (!state.Docked || state.Travel != null) return false;
        var contract = state.Offers.FirstOrDefault(offer => offer.Id == contractId);
        if (contract == null) return false;
        state.Offers.Remove(contract);
        state.Jobs.Add(contract);
        state.Log.Insert(0, $"Accepted contract: {contract.Title}. Deliver to {contract.Destination}.");
        return true;
    }

    public static bool Depart(GameState state, string destination)
    {
        if (!state.Docked || state.Travel != null || string.Equals(state.Location, destination, StringComparison.Ordinal)) return false;
        if (!RouteDays.TryGetValue((state.Location, destination), out var days)) return false;
        var fuelNeeded = days * FuelPerDay;
        if (state.Fuel < fuelNeeded) return false;
        state.Travel = new TravelState { From = state.Location, Destination = destination, Total = days, Left = days };
        state.Docked = false;
        state.Log.Insert(0, $"Departed {state.Location} for {destination}. {days} days out.");
        return true;
    }

    public static bool AdvanceTravelDay(GameState state)
    {
        if (state.Travel == null) return false;
        state.Day++;
        state.Fuel = Math.Max(0f, state.Fuel - FuelPerDay);
        state.Food = Math.Max(0, state.Food - FoodPerDay);
        state.Travel.Left--;

        if (state.Travel.Left <= 0)
        {
            Arrive(state);
        }
        else
        {
            state.Log.Insert(0, $"Holding course. {state.Travel.Left} days remain.");
        }

        return true;
    }

    private static void Arrive(GameState state)
    {
        var destination = state.Travel!.Destination;
        state.Location = destination;
        state.Docked = true;
        state.Travel = null;
        state.Log.Insert(0, $"Docked at {destination}.");

        foreach (var job in state.Jobs.Where(job => job.Destination == destination).ToArray())
        {
            state.Jobs.Remove(job);
            state.Credits += job.Pay;
            state.Prestige += job.Prestige;
            state.Log.Insert(0, $"Completed {job.Title}: paid {job.Pay} credits.");
        }
    }
}
