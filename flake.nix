{
  description = "Latency desktop music player";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { self, nixpkgs }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
    in {
      packages = forAllSystems (system:
        let pkgs = import nixpkgs { inherit system; };
        in {
          default = self.packages.${system}.latency-player;
          latency-player = pkgs.buildNpmPackage {
            pname = "latency-player";
            version = (builtins.fromJSON (builtins.readFile ./package.json)).version;
            src = pkgs.lib.cleanSourceWith {
              src = ./.;
              filter = path: type:
                !(builtins.elem (baseNameOf path) [
                  ".git" "node_modules" "out" "release" "dist"
                ]);
            };
            npmDepsHash = "sha256-tKk8/o5CjY+p2kaB0oWr+7BrnSyN2g6foIYv8idnsOk=";
            env.ELECTRON_SKIP_BINARY_DOWNLOAD = "1";
            nativeBuildInputs = [ pkgs.makeWrapper pkgs.copyDesktopItems ];
            npmBuildScript = "build";
            installPhase = ''
              runHook preInstall
              mkdir -p $out/share/latency-player $out/bin
              cp -r out build package.json $out/share/latency-player/
              cp -r node_modules $out/share/latency-player/
              # Electron's portal picker can report cancellation after Open on
              # some NixOS desktops. Use GTK, and XWayland for the Vulkan/Wayland
              # incompatibility in the nixpkgs Electron runtime.
              makeWrapper ${pkgs.electron}/bin/electron $out/bin/latency \
                --add-flags "--ozone-platform=x11 --xdg-portal-required-version=999" \
                --add-flags $out/share/latency-player/out/main/index.js
              for icon in build/icons/*.png; do
                size=$(basename "$icon" .png)
                install -Dm644 "$icon" "$out/share/icons/hicolor/$size/apps/latency.png"
              done
              runHook postInstall
            '';
            desktopItems = [ (pkgs.makeDesktopItem {
              name = "latency";
              desktopName = "Latency";
              exec = "latency %U";
              icon = "latency";
              comment = "Music player for local files, SoundCloud and Yandex Music";
              categories = [ "AudioVideo" "Audio" "Player" ];
              startupWMClass = "latency";
            }) ];
            meta = {
              description = "Desktop music player with local, SoundCloud and Yandex Music sources";
              homepage = "https://github.com/LightMizu/latency-player";
              license = pkgs.lib.licenses.mit;
              platforms = systems;
              mainProgram = "latency";
            };
          };
        });
      apps = forAllSystems (system: {
        default = {
          type = "app";
          program = "${self.packages.${system}.latency-player}/bin/latency";
        };
      });
    };
}
