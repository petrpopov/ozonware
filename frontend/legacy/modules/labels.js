import { products } from './state.js';
import { getInventoryData } from './inventory.js';

const transliterate = (text) => {
    const map = {
        'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo',
        'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
        'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
        'ф': 'f', 'х': 'h', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch', 'ъ': '',
        'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
        'А': 'A', 'Б': 'B', 'В': 'V', 'Г': 'G', 'Д': 'D', 'Е': 'E', 'Ё': 'Yo',
        'Ж': 'Zh', 'З': 'Z', 'И': 'I', 'Й': 'Y', 'К': 'K', 'Л': 'L', 'М': 'M',
        'Н': 'N', 'О': 'O', 'П': 'P', 'Р': 'R', 'С': 'S', 'Т': 'T', 'У': 'U',
        'Ф': 'F', 'Х': 'H', 'Ц': 'Ts', 'Ч': 'Ch', 'Ш': 'Sh', 'Щ': 'Sch', 'Ъ': '',
        'Ы': 'Y', 'Ь': '', 'Э': 'E', 'Ю': 'Yu', 'Я': 'Ya'
    };
    return text.split('').map(char => map[char] || char).join('');
};

export function generateBoxLabel(boxNumber, items) {
    const { jsPDF } = window.jspdf;

    const labelWidth = 58;
    const labelHeight = 40;

    const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: [labelHeight, labelWidth]
    });

    const margin = 2;
    const lineHeight = 3.5;
    const maxLinesPerLabel = Math.floor((labelHeight - margin * 2 - 6) / lineHeight);

    const allLines = [];

    allLines.push({ text: `BOX #${boxNumber}`, fontSize: 12, bold: true, isHeader: true });
    allLines.push({ text: `Items: ${items.length}`, fontSize: 8, bold: false, isSubheader: true });
    allLines.push({ text: '--------------------------------', fontSize: 7, bold: false, isSeparator: true });

    items.forEach((item, index) => {
        const productName = transliterate(item.product.name);
        allLines.push({ text: `${index + 1}. ${productName}`, fontSize: 8, bold: true, isProduct: true });
        allLines.push({ text: `   SKU: ${item.product.sku}`, fontSize: 7, bold: false, isSKU: true });
        allLines.push({ text: `   Qty: ${item.count} pcs`, fontSize: 8, bold: true, isQuantity: true });
    });

    let pageCount = 0;
    let lineIndex = 0;

    while (lineIndex < allLines.length) {
        if (pageCount > 0) {
            doc.addPage([labelHeight, labelWidth], 'landscape');
        }

        let currentY = margin + 4;
        let linesOnPage = 0;

        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text(`BOX #${boxNumber} (${pageCount + 1})`, labelWidth / 2, margin + 3, { align: 'center' });

        currentY = margin + 7;

        while (lineIndex < allLines.length && linesOnPage < maxLinesPerLabel) {
            const line = allLines[lineIndex];

            if (pageCount > 0 && (line.isHeader || line.isSubheader)) {
                lineIndex++;
                continue;
            }

            doc.setFontSize(line.fontSize);
            doc.setFont('helvetica', line.bold ? 'bold' : 'normal');

            const textWidth = doc.getTextWidth(line.text);
            const maxWidth = labelWidth - margin * 2;

            if (textWidth > maxWidth) {
                const words = line.text.split(' ');
                let currentLine = '';

                for (const word of words) {
                    const testLine = currentLine + (currentLine ? ' ' : '') + word;
                    const testWidth = doc.getTextWidth(testLine);

                    if (testWidth > maxWidth && currentLine) {
                        doc.text(currentLine, margin, currentY);
                        currentY += lineHeight;
                        linesOnPage++;
                        currentLine = word;
                        if (linesOnPage >= maxLinesPerLabel) break;
                    } else {
                        currentLine = testLine;
                    }
                }

                if (currentLine && linesOnPage < maxLinesPerLabel) {
                    doc.text(currentLine, margin, currentY);
                    currentY += lineHeight;
                    linesOnPage++;
                }
            } else {
                doc.text(line.text, margin, currentY);
                currentY += lineHeight;
                linesOnPage++;
            }

            lineIndex++;
            if (linesOnPage >= maxLinesPerLabel) break;
        }

        pageCount++;
    }

    doc.save(`Label_Box_${boxNumber}.pdf`);
}

export function downloadBoxLabel(boxNumber) {
    const inventoryData = getInventoryData();
    const box = inventoryData.boxes.find(b => b.boxNumber === boxNumber);

    if (!box) {
        alert('Короб не найден!');
        return;
    }

    const items = Object.values(box.items);
    generateBoxLabel(boxNumber, items);
}

export function downloadProductLabel() {
    const productId = document.getElementById('productId').value;
    if (!productId) {
        alert('Сначала сохраните товар');
        return;
    }

    const product = products.find(p => p.id == productId);
    if (!product) {
        alert('Товар не найден');
        return;
    }

    const ozonField = product.custom_fields?.find(f =>
        f.name.toLowerCase().includes('артикул') && f.name.toLowerCase().includes('ozon')
    );
    const ozonArticle = ozonField?.value || product.sku || 'NO-SKU';

    const colorField = product.custom_fields?.find(f =>
        f.name.toLowerCase().includes('код') && f.name.toLowerCase().includes('цвет')
    );
    const colorCode = colorField?.value || '';

    const productName = product.name || '';

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: [58, 40]
    });

    pdf.setFont('helvetica', 'bold');

    const pageWidth = 58;
    const pageHeight = 40;
    const pMargin = 1.5;
    const contentWidth = pageWidth - (pMargin * 2);

    function findMaxFontSize(text, maxWidth, maxHeight, minSize = 6, maxSize = 20) {
        let bestSize = minSize;
        let bestLines = [];

        for (let size = maxSize; size >= minSize; size -= 0.5) {
            pdf.setFontSize(size);
            const lines = pdf.splitTextToSize(text, maxWidth);
            const lh = size * 0.35;
            const totalHeight = lines.length * lh;

            if (totalHeight <= maxHeight) {
                bestSize = size;
                bestLines = lines;
                break;
            }
        }

        return { size: bestSize, lines: bestLines, lineHeight: bestSize * 0.35 };
    }

    let currentY = pMargin + 2;

    const articleResult = findMaxFontSize(ozonArticle, contentWidth, 8, 8, 14);
    pdf.setFontSize(articleResult.size);
    pdf.text(articleResult.lines[0], pageWidth / 2, currentY, { align: 'center' });
    currentY += articleResult.size * 0.5;

    if (colorCode) {
        const colorResult = findMaxFontSize(colorCode, contentWidth, 10, 10, 16);
        currentY += 1;
        pdf.setFontSize(colorResult.size);
        pdf.text(colorResult.lines[0], pageWidth / 2, currentY, { align: 'center' });
        currentY += colorResult.size * 0.5;
    }

    currentY += 1;
    const remainingHeight = pageHeight - currentY - pMargin;

    const nameResult = findMaxFontSize(productName, contentWidth, remainingHeight, 8, 18);
    pdf.setFontSize(nameResult.size);

    const totalNameHeight = nameResult.lines.length * nameResult.lineHeight;
    const startY = currentY + (remainingHeight - totalNameHeight) / 2;

    nameResult.lines.forEach((line, index) => {
        pdf.text(line, pageWidth / 2, startY + (index * nameResult.lineHeight), { align: 'center' });
    });

    const filename = `Этикетка_${ozonArticle.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
    pdf.save(filename);
}
