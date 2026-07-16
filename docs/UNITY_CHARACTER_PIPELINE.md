# Unity Captain Character Pipeline

The Unity port keeps all three Meshy GLBs as immutable source assets and builds
Unity-native animation, material, controller, and prefab assets from them.

## Character Mapping

| Picker ID | Browser source | Unity prefab | Animations |
| --- | --- | --- | ---: |
| `explorer` | `src/assets/models/captain-explorer.glb` | `CaptainExplorer.prefab` | 15 |
| `female-explorer` | `src/assets/models/captain-female-explorer.glb` | `CaptainFemaleExplorer.prefab` | 9 |
| `alien-explorer` | `src/assets/models/captain-alien-explorer.glb` | `CaptainAlienExplorer.prefab` | 9 |

The source GLBs are copied, not moved, to
`unity/Assets/Kestrel/Content/Characters/SourceGLB`. The source and Unity copies
must keep matching SHA-256 hashes:

- Explorer: `E355CACC73071C9D11E6437AFF71905AD49746302D4EE9CF097F46E50825BE4C`
- Female explorer: `6D58BA430D2FAE2FE8699DC6282C0C6A352A29B8B85D4D93B3227D789D164463`
- Alien explorer: `68CDE506AB10912EAE43837211513E2760AD4EF4224A98A8F2807DA6F8509FB3`

## Generated Unity Assets

`KestrelCaptainPrefabBuilder` uses glTFast's Mecanim import and creates:

- all 33 source clips as individual `.anim` assets;
- one native material per character, with Meshy emission/specular response
  restrained for the ship lighting;
- one Animator Controller per character with `Idle` and `Walk` states;
- grounded, consistently scaled prefabs under
  `Assets/Resources/Kestrel/Characters`.

Explorer and female explorer use their supplied idle clips. The alien source has
no idle animation, so its controller holds a readable pose from `Walking` while
stationary and plays the full walking clip while moving.

## Rebuilding and Testing

Run either:

```powershell
scripts/unity.ps1 setup
```

or choose `Kestrel > Characters > Rebuild Captain Prefabs` in Unity.

The WebGL development monitor exposes Man, Woman, and Frog buttons using the
same stable IDs as the browser character picker. Runtime movement drives the
Animator's `Moving` parameter. This presentation selection deliberately does
not change save version 16.

Before committing character changes, run:

```powershell
scripts/unity.ps1 unity-test
scripts/unity.ps1 build-web-dev
```
