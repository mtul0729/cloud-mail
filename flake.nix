{
  description = "Cloud Mail packages";

  inputs.nixpkgs.url = "nixpkgs";

  outputs =
    { self, nixpkgs, ... }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
      ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
      pkgsFor = system: nixpkgs.legacyPackages.${system};
    in
    {
      devShells = forAllSystems (
        system:
        let
          pkgs = pkgsFor system;
        in
        {
          default = pkgs.mkShell {
            packages = [
              pkgs.nodejs_22
              pkgs.pnpm
            ];
          };
        }
      );

      formatter = forAllSystems (system: (pkgsFor system).nixpkgs-fmt);

      packages = forAllSystems (
        system:
        let
          pkgs = pkgsFor system;
          version = "0-unstable";

          mailVueDist = pkgs.stdenvNoCC.mkDerivation {
            pname = "cloud-mail-vue-dist";
            inherit version;
            src = ./.;

            pnpmRoot = "mail-vue";
            pnpmDeps = pkgs.fetchPnpmDeps {
              pname = "cloud-mail-vue";
              inherit version;
              src = ./mail-vue;
              fetcherVersion = 3;
              hash = "sha256-ybISRDHb5+YqM768LHGaVMkxrqzgkkGj3OgVWZiYAgU=";
            };

            nativeBuildInputs = [
              pkgs.nodejs_22
              pkgs.pnpm
              pkgs.pnpmConfigHook
            ];

            buildPhase = ''
              runHook preBuild
              cd mail-vue
              pnpm run build
              cd ..
              runHook postBuild
            '';

            installPhase = ''
              runHook preInstall
              cp -a mail-worker/dist "$out"
              runHook postInstall
            '';
          };

          worker = pkgs.stdenvNoCC.mkDerivation {
            pname = "cloud-mail-worker";
            inherit version;
            src = ./.;

            pnpmRoot = "mail-worker";
            pnpmDeps = pkgs.fetchPnpmDeps {
              pname = "cloud-mail-worker";
              inherit version;
              src = ./mail-worker;
              fetcherVersion = 3;
              hash = "sha256-cE2SxpWHWt5yzazvWgDisnng8D8aZVG8tcdRdpxqDRg=";
            };

            nativeBuildInputs = [
              pkgs.nodejs_22
              pkgs.pnpm
              pkgs.pnpmConfigHook
            ];

            buildPhase = ''
              runHook preBuild
              cp -a ${mailVueDist} mail-worker/dist
              runHook postBuild
            '';

            installPhase = ''
              runHook preInstall
              mkdir -p "$out"
              cp -a mail-worker "$out/"
              runHook postInstall
            '';
          };
        in
        {
          inherit mailVueDist worker;
          default = worker;
        }
      );
    };
}
