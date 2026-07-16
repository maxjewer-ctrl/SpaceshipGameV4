using System;

namespace Kestrel.Sim;

public sealed class DeterministicRng
{
    private uint state;

    public DeterministicRng(int seed)
    {
        state = seed == 0 ? 0x6d2b79f5u : unchecked((uint)seed);
    }

    public uint NextUInt()
    {
        var x = state;
        x ^= x << 13;
        x ^= x >> 17;
        x ^= x << 5;
        state = x;
        return x;
    }

    public int NextInt(int minInclusive, int maxExclusive)
    {
        if (maxExclusive <= minInclusive)
        {
            throw new ArgumentOutOfRangeException(nameof(maxExclusive), "maxExclusive must be greater than minInclusive.");
        }

        var range = (uint)(maxExclusive - minInclusive);
        return minInclusive + (int)(NextUInt() % range);
    }
}
