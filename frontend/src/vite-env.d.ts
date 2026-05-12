/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GENLAYER_NETWORK: "asimov" | "bradbury" | undefined;
  readonly VITE_API_URL: string | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
