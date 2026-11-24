import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/figtree";
import "./styles/tokens.css";
import "./styles/base.css";
import { startSnowfall } from "./snowfall";

const canvas = document.querySelector<HTMLCanvasElement>(".snowfall");
if (canvas) startSnowfall(canvas);
