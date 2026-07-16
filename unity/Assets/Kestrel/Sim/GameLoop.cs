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
    public const int FoodPerPersonPerDay = 1;
    public const int HydroponicsFoodPerDay = 2;

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
        if (state.Travel == null || state.Over) return false;
        DayTick(state, true);
        state.Travel.Left--;

        if (state.Travel.Left <= 0)
        {
            Arrive(state);
        }
        else if (!state.Over)
        {
            state.Log.Insert(0, $"Holding course. {state.Travel.Left} days remain.");
        }

        return true;
    }

    public static bool WaitDay(GameState state)
    {
        if (!state.Docked || state.Travel != null || state.Over) return false;
        DayTick(state, false);
        if (!state.Over) state.Log.Insert(0, "You wait a day in port. The dockworkers play cards. The meter runs.");
        return true;
    }

    public static void DayTick(GameState state, bool traveling)
    {
        if (state.Over) return;
        state.Day++;
        foreach (var crew in state.Crew) crew.DaysAboard++;

        if (traveling) state.Fuel = Math.Max(0f, state.Fuel - FuelPerDay);

        var foodGenerated = state.Ship.Modules.Count(module =>
            module.Key == "hydro" && module.Powered && !module.Damaged) * HydroponicsFoodPerDay;
        var foodConsumed = (1 + state.Crew.Count) * FoodPerPersonPerDay;
        state.Food += foodGenerated - foodConsumed;
        if (state.Food < 0)
        {
            state.Food = 0;
            state.Starve++;
            state.Prestige = Math.Max(0, state.Prestige - 1);
            if (state.Starve == 2)
                state.Log.Insert(0, "The pantry is empty. Everyone's rationing air-paste and resentment.");
            if (state.Starve == 4 && state.Crew.Count > 0)
            {
                var crew = state.Crew[^1];
                state.Crew.RemoveAt(state.Crew.Count - 1);
                state.Log.Insert(0, $"{crew.Name} is too weak to work and jumps ship at the first chance. Starvation is bad for retention.");
            }
            if (state.Starve >= 6)
            {
                state.Over = true;
                state.Dead = true;
                state.Log.Insert(0, "You starved in the black. The ship drifts on, a quiet tomb with your name on the registry.");
                return;
            }
            if (state.Starve >= 2) state.Log.Insert(0, "STARVING - buy food, fast.");
        }
        else
        {
            state.Starve = 0;
        }

        var payroll = state.Crew.Sum(crew => crew.Salary);
        if (payroll <= 0) return;
        if (state.Credits >= payroll)
        {
            state.Credits -= payroll;
            state.Unpaid = 0;
            return;
        }

        state.Unpaid++;
        state.Log.Insert(0, "You couldn't make payroll. The crew notices these things.");
        if (state.Unpaid < 3 || state.Crew.Count == 0) return;
        var departingCrew = state.Crew[0];
        state.Crew.RemoveAt(0);
        state.Log.Insert(0, $"{departingCrew.Name} quit over back pay. Word gets around (-2 prestige).");
        state.Prestige = Math.Max(0, state.Prestige - 2);
        state.Unpaid = 1;
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
