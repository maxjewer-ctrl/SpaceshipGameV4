using System;

namespace Kestrel.Sim;

public sealed class DeterministicRng
{
    private int state;

    public DeterministicRng(int state) => this.state = state;

    public int State => state;

    public uint NextUInt()
    {
        state = unchecked(state + (int)0x6d2b79f5u);
        var value = unchecked((uint)state);
        value = unchecked((value ^ (value >> 15)) * (value | 1u));
        value ^= unchecked(value + unchecked((value ^ (value >> 7)) * (value | 61u)));
        return value ^ (value >> 14);
    }

    public double NextDouble() => NextUInt() / 4294967296d;

    public int NextInt(int minInclusive, int maxExclusive)
    {
        if (maxExclusive <= minInclusive)
        {
            throw new ArgumentOutOfRangeException(nameof(maxExclusive), "maxExclusive must be greater than minInclusive.");
        }

        return minInclusive + (int)Math.Floor(NextDouble() * (maxExclusive - minInclusive));
    }
}
