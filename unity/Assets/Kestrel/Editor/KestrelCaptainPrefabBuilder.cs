using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Kestrel.Game;
using UnityEditor;
using UnityEditor.Animations;
using UnityEngine;
using UnityEngine.Rendering;
using Object = UnityEngine.Object;

namespace Kestrel.Editor;

public static class KestrelCaptainPrefabBuilder
{
    public const string SourceRoot = "Assets/Kestrel/Content/Characters/SourceGLB";
    public const string OutputRoot = "Assets/Resources/Kestrel/Characters";
    public const string NativeRoot = "Assets/Kestrel/Content/Characters/Native";
    public const float TargetHeight = 1.62f;

    private const string MovingParameter = "Moving";

    private static readonly CaptainDefinition[] Definitions =
    {
        new("explorer", "CaptainExplorer", "captain-explorer.glb", "Idle_8", "Walking"),
        new("female-explorer", "CaptainFemaleExplorer", "captain-female-explorer.glb", "Idle_3", "Walking"),
        new("alien-explorer", "CaptainAlienExplorer", "captain-alien-explorer.glb", "", "Walking")
    };

    public static IReadOnlyList<string> ModelIds => Definitions.Select(definition => definition.Id).ToArray();

    [MenuItem("Kestrel/Characters/Rebuild Captain Prefabs")]
    public static void EnsurePrefabs()
    {
        EnsureFolder(OutputRoot);
        EnsureFolder(NativeRoot);

        foreach (var definition in Definitions)
        {
            BuildCaptain(definition);
        }

        AssetDatabase.SaveAssets();
        AssetDatabase.Refresh();
    }

    public static string SourcePathFor(string modelId) =>
        $"{SourceRoot}/{Find(modelId).SourceFile}";

    public static string PrefabPathFor(string modelId) =>
        $"{OutputRoot}/{Find(modelId).NativeName}.prefab";

    private static CaptainDefinition Find(string modelId) =>
        Definitions.First(definition => definition.Id == modelId);

    private static void BuildCaptain(CaptainDefinition definition)
    {
        var sourcePath = $"{SourceRoot}/{definition.SourceFile}";
        AssetDatabase.ImportAsset(sourcePath, ImportAssetOptions.ForceSynchronousImport | ImportAssetOptions.ForceUpdate);
        var source = AssetDatabase.LoadAssetAtPath<GameObject>(sourcePath);
        if (source == null)
        {
            throw new InvalidOperationException($"glTFast did not import a GameObject from {sourcePath}.");
        }

        var sourceClips = AssetDatabase.LoadAllAssetsAtPath(sourcePath)
            .OfType<AnimationClip>()
            .Where(clip => !clip.name.StartsWith("__preview__", StringComparison.OrdinalIgnoreCase))
            .OrderBy(clip => clip.name, StringComparer.OrdinalIgnoreCase)
            .ToArray();
        if (sourceClips.Length == 0)
        {
            throw new InvalidOperationException($"No animation clips were imported from {sourcePath}.");
        }

        var definitionRoot = $"{NativeRoot}/{definition.NativeName}";
        var animationRoot = $"{definitionRoot}/Animations";
        var materialRoot = $"{definitionRoot}/Materials";
        EnsureFolder(animationRoot);
        EnsureFolder(materialRoot);

        var clips = CreateNativeClips(sourceClips, animationRoot);
        var idleClip = SelectClip(clips, definition.IdleClip, "Idle", "Walking");
        var walkClip = SelectClip(clips, definition.WalkClip, "Walking", "Running", "Stage_Walk");
        var controller = CreateController(definition, definitionRoot, idleClip, walkClip);

        var prefabRoot = new GameObject(definition.NativeName);
        try
        {
            var modelFit = new GameObject("Model Fit");
            modelFit.transform.SetParent(prefabRoot.transform, false);
            var model = Object.Instantiate(source);
            model.name = "Animated Model";
            model.transform.SetParent(modelFit.transform, false);
            model.transform.SetLocalPositionAndRotation(Vector3.zero, Quaternion.identity);
            model.transform.localScale = Vector3.one;

            var animator = model.GetComponent<Animator>() ?? model.AddComponent<Animator>();
            animator.runtimeAnimatorController = controller;
            animator.applyRootMotion = false;
            animator.cullingMode = AnimatorCullingMode.AlwaysAnimate;

            FitAndGround(modelFit.transform, model);
            CreateNativeMaterials(model, materialRoot);
            ConfigureRenderers(model);

            var prefabPath = PrefabPathFor(definition.Id);
            PrefabUtility.SaveAsPrefabAsset(prefabRoot, prefabPath);
            Debug.Log($"Built {prefabPath} from retained {sourcePath} with {sourceClips.Length} animations.");
        }
        finally
        {
            Object.DestroyImmediate(prefabRoot);
        }
    }

    private static Dictionary<string, AnimationClip> CreateNativeClips(
        IEnumerable<AnimationClip> sourceClips,
        string animationRoot)
    {
        var result = new Dictionary<string, AnimationClip>(StringComparer.OrdinalIgnoreCase);
        foreach (var sourceClip in sourceClips)
        {
            var safeName = SafeAssetName(sourceClip.name);
            var path = $"{animationRoot}/{safeName}.anim";
            AssetDatabase.DeleteAsset(path);
            var clip = Object.Instantiate(sourceClip);
            clip.name = sourceClip.name;
            clip.wrapMode = ShouldLoop(sourceClip.name) ? WrapMode.Loop : WrapMode.Once;
            AssetDatabase.CreateAsset(clip, path);
            SetLoopTime(clip, ShouldLoop(sourceClip.name));
            result[sourceClip.name] = clip;
        }

        return result;
    }

    private static AnimatorController CreateController(
        CaptainDefinition definition,
        string definitionRoot,
        AnimationClip idleClip,
        AnimationClip walkClip)
    {
        var path = $"{definitionRoot}/{definition.NativeName}.controller";
        AssetDatabase.DeleteAsset(path);
        var controller = AnimatorController.CreateAnimatorControllerAtPath(path);
        controller.AddParameter(MovingParameter, AnimatorControllerParameterType.Bool);
        var stateMachine = controller.layers[0].stateMachine;
        var idle = stateMachine.AddState("Idle");
        idle.motion = idleClip;
        var walk = stateMachine.AddState("Walk");
        walk.motion = walkClip;
        stateMachine.defaultState = idle;

        if (string.IsNullOrEmpty(definition.IdleClip))
        {
            idle.speed = 0f;
            idle.cycleOffset = walkClip.length <= 0f ? 0.13f : Mathf.Clamp01(0.13f / walkClip.length);
        }

        AddTransition(idle, walk, true);
        AddTransition(walk, idle, false);
        return controller;
    }

    private static void AddTransition(AnimatorState from, AnimatorState to, bool moving)
    {
        var transition = from.AddTransition(to);
        transition.hasExitTime = false;
        transition.hasFixedDuration = true;
        transition.duration = 0.12f;
        transition.AddCondition(
            moving ? AnimatorConditionMode.If : AnimatorConditionMode.IfNot,
            0f,
            MovingParameter);
    }

    private static AnimationClip SelectClip(
        IReadOnlyDictionary<string, AnimationClip> clips,
        params string[] names)
    {
        foreach (var name in names.Where(name => !string.IsNullOrWhiteSpace(name)))
        {
            if (clips.TryGetValue(name, out var exact)) return exact;
            var partial = clips.FirstOrDefault(pair =>
                pair.Key.Contains(name, StringComparison.OrdinalIgnoreCase));
            if (partial.Value != null) return partial.Value;
        }

        return clips.Values.First();
    }

    private static void FitAndGround(Transform modelFit, GameObject model)
    {
        var bounds = RendererBounds(model);
        if (bounds.size.y <= 0.0001f)
        {
            throw new InvalidOperationException($"{model.name} has no usable renderer bounds.");
        }

        modelFit.localScale = Vector3.one * (TargetHeight / bounds.size.y);
        bounds = RendererBounds(model);
        modelFit.localPosition = new Vector3(
            -bounds.center.x,
            -bounds.min.y,
            -bounds.center.z);
    }

    private static Bounds RendererBounds(GameObject model)
    {
        var renderers = model.GetComponentsInChildren<Renderer>(true);
        if (renderers.Length == 0) return new Bounds(Vector3.zero, Vector3.zero);
        var bounds = renderers[0].bounds;
        foreach (var renderer in renderers.Skip(1)) bounds.Encapsulate(renderer.bounds);
        return bounds;
    }

    private static void CreateNativeMaterials(GameObject model, string materialRoot)
    {
        var nativeMaterials = new Dictionary<Material, Material>();
        foreach (var renderer in model.GetComponentsInChildren<Renderer>(true))
        {
            var materials = renderer.sharedMaterials;
            for (var index = 0; index < materials.Length; index++)
            {
                var source = materials[index];
                if (source == null) continue;
                if (!nativeMaterials.TryGetValue(source, out var native))
                {
                    var path = $"{materialRoot}/{SafeAssetName(source.name)}.mat";
                    AssetDatabase.DeleteAsset(path);
                    native = new Material(source) { name = source.name };
                    TameMeshyMaterial(native);
                    AssetDatabase.CreateAsset(native, path);
                    nativeMaterials[source] = native;
                }
                materials[index] = native;
            }
            renderer.sharedMaterials = materials;
        }
    }

    private static void TameMeshyMaterial(Material material)
    {
        if (material.HasProperty("_EmissionColor")) material.SetColor("_EmissionColor", Color.black);
        if (material.HasProperty("_EmissiveFactor")) material.SetColor("_EmissiveFactor", Color.black);
        if (material.HasProperty("_Metallic")) material.SetFloat("_Metallic", Mathf.Min(material.GetFloat("_Metallic"), 0.35f));
        if (material.HasProperty("_Smoothness")) material.SetFloat("_Smoothness", Mathf.Min(material.GetFloat("_Smoothness"), 0.45f));
        if (material.HasProperty("_Glossiness")) material.SetFloat("_Glossiness", Mathf.Min(material.GetFloat("_Glossiness"), 0.45f));
        if (material.HasProperty("_SpecColor")) material.SetColor("_SpecColor", Color.white);
        material.DisableKeyword("_EMISSION");
        EditorUtility.SetDirty(material);
    }

    private static void ConfigureRenderers(GameObject model)
    {
        foreach (var renderer in model.GetComponentsInChildren<Renderer>(true))
        {
            renderer.shadowCastingMode = ShadowCastingMode.On;
            renderer.receiveShadows = true;
            if (renderer is SkinnedMeshRenderer skinned) skinned.updateWhenOffscreen = true;
        }
    }

    private static void SetLoopTime(AnimationClip clip, bool loop)
    {
        var serialized = new SerializedObject(clip);
        var loopProperty = serialized.FindProperty("m_AnimationClipSettings.m_LoopTime");
        if (loopProperty != null)
        {
            loopProperty.boolValue = loop;
            serialized.ApplyModifiedPropertiesWithoutUndo();
        }
    }

    private static bool ShouldLoop(string clipName) =>
        clipName.Contains("idle", StringComparison.OrdinalIgnoreCase) ||
        clipName.Contains("walk", StringComparison.OrdinalIgnoreCase) ||
        clipName.Contains("run", StringComparison.OrdinalIgnoreCase) ||
        clipName.Contains("sleep", StringComparison.OrdinalIgnoreCase) ||
        clipName.Contains("ladder", StringComparison.OrdinalIgnoreCase);

    private static string SafeAssetName(string value)
    {
        foreach (var invalid in Path.GetInvalidFileNameChars()) value = value.Replace(invalid, '_');
        return value.Replace('|', '_').Trim();
    }

    private static void EnsureFolder(string path)
    {
        var current = "Assets";
        foreach (var segment in path.Split('/').Skip(1))
        {
            var next = $"{current}/{segment}";
            if (!AssetDatabase.IsValidFolder(next)) AssetDatabase.CreateFolder(current, segment);
            current = next;
        }
    }

    private sealed class CaptainDefinition
    {
        public CaptainDefinition(string id, string nativeName, string sourceFile, string idleClip, string walkClip)
        {
            Id = id;
            NativeName = nativeName;
            SourceFile = sourceFile;
            IdleClip = idleClip;
            WalkClip = walkClip;
        }

        public string Id { get; }
        public string NativeName { get; }
        public string SourceFile { get; }
        public string IdleClip { get; }
        public string WalkClip { get; }
    }
}
