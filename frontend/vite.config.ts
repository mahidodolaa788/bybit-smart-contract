import { defineConfig } from "vite";
import * as dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env") });
console.log("process.env", process.env);

export default defineConfig(({ mode }) => {  return {
    define: {
      "import.meta.env.VITE_CONTRACT_ADDRESS": JSON.stringify(
        process.env.CONTRACT_ADDRESS
      ),
      "import.meta.env.VITE_RELAYER_ADDRESS": JSON.stringify(
        process.env.RELAYER_ADDRESS
      ),
    },
    server: {
      port: 8080,
    },
  };
});
