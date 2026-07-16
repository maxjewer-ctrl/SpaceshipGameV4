using UnityEngine;

namespace Kestrel.Game;

public static class KestrelBootstrap
{
    [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
    private static void Boot()
    {
        if (Object.FindFirstObjectByType<ShipDeckRuntime>() != null)
        {
            return;
        }

        var runtime = new GameObject("Kestrel Runtime");
        Object.DontDestroyOnLoad(runtime);
        runtime.AddComponent<ShipDeckRuntime>();
    }
}
