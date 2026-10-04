import fs from "fs";
import path from "path";
import sharp from "sharp";

const inputDir = path.resolve("./public/prod-page");
const files = fs.readdirSync(inputDir);

console.log("Starting image conversion to WebP...");

const mappings = [
  { src: "Polished Chrome Shower System.png", dest: "shower-system.webp" },
  { src: "Modern White Ceramic Sink with Chrome Faucet.png", dest: "ceramic-sink.webp" },
  { src: "Chrome Single-Handle Bathroom Faucet.png", dest: "bathroom-faucet.webp" },
  { src: "Modern LED Bathroom Vanity Cabinet.png", dest: "vanity-cabinet.webp" },
  { src: "Chrome Bidet Sprayer Set with Coiled Hose.png", dest: "bidet-sprayer.webp" },
  { src: "Chrome Towel Rack with Folded Towels.png", dest: "towel-rack.webp" },
  { src: "Chrome Towel Ring with Plush White Towel.png", dest: "towel-ring.webp" },
];

for (const item of mappings) {
  const srcPath = path.join(inputDir, item.src);
  const destPath = path.join(inputDir, item.dest);

  if (fs.existsSync(srcPath)) {
    const inputStats = fs.statSync(srcPath);
    await sharp(srcPath)
      .webp({ quality: 85, effort: 6 })
      .toFile(destPath);
    const outputStats = fs.statSync(destPath);
    const reduction = (((inputStats.size - outputStats.size) / inputStats.size) * 100).toFixed(1);
    console.log(
      `✓ Converted: ${item.src} (${(inputStats.size / 1024).toFixed(0)}KB) -> ${item.dest} (${(outputStats.size / 1024).toFixed(0)}KB) [${reduction}% smaller]`
    );
  } else {
    console.warn(`File not found: ${item.src}`);
  }
}

console.log("All images successfully converted to WebP!");
