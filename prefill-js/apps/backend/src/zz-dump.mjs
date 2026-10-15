import { extractTextItems } from "./services/pdf/pdf-text-service.js";
const items = await extractTextItems("../../data/Blank Forms/360 ONE Global Bond Fund - Series II.pdf");
const [page, fromY, toY] = process.argv.slice(2).map(Number);
for (const it of items.filter((n) => n.page === page && n.y >= fromY && n.y <= toY)) console.log(it.x, it.y, it.width, it.fontSize, JSON.stringify(it.text.slice(0, 70)));
