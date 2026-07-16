using System.Runtime.InteropServices;
using UnityEngine;

namespace Kestrel.Game;

public static class KestrelSaveStore
{
#if UNITY_WEBGL && !UNITY_EDITOR
    [DllImport("__Internal")]
    private static extern void KestrelLocalStorageSave(string key, string value);

    [DllImport("__Internal")]
    private static extern string KestrelLocalStorageLoad(string key);
#endif

    public static void Save(string key, string value)
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        KestrelLocalStorageSave(key, value);
#else
        PlayerPrefs.SetString(key, value);
        PlayerPrefs.Save();
#endif
    }

    public static string Load(string key)
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        return KestrelLocalStorageLoad(key);
#else
        return PlayerPrefs.GetString(key, "");
#endif
    }
}
