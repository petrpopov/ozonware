export function toggleAccordion(id) {
    const content = document.getElementById(id);
    if (!content) {
        return;
    }

    const item = content.closest('.accordion-item');
    if (!item) {
        return;
    }

    item.classList.toggle('active');
}
