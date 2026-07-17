using System.IO;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;

namespace Kestrel.Editor;

public static class KestrelBuild
{
    public static void BuildWebDev()
    {
        KestrelProjectSetup.EnsureProject();
        KestrelContentSync.SyncBrowserContent();
        var output = Path.GetFullPath("Builds/WebGLDev");
        Directory.CreateDirectory(output);

        var options = new BuildPlayerOptions
        {
            scenes = new[] { KestrelProjectSetup.ShipDeckScenePath },
            locationPathName = output,
            target = BuildTarget.WebGL,
            options = BuildOptions.Development | BuildOptions.AllowDebugging
        };

        var report = BuildPipeline.BuildPlayer(options);
        if (report.summary.result != BuildResult.Succeeded)
        {
            throw new BuildFailedException($"WebGL development build failed: {report.summary.result}");
        }
    }
}
