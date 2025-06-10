export const activateActionButton = (handler: () => void) => {
    const actionButton = document.getElementById("action-button");
    if (actionButton) {
        actionButton.addEventListener("click", handler);
    }
}

export const setActionButtonNotLoading = () => {
    const actionButton = document.getElementById("action-button") as HTMLButtonElement;
    if (actionButton) {
        actionButton.disabled = false;
        actionButton.classList.remove("loading");
        actionButton.style.backgroundColor = "var(--primary-color)";
    }
}

export const setActionButtonLoading = (text: string) => {
    const actionButton = document.getElementById("action-button") as HTMLButtonElement;
    if (actionButton) {
        actionButton.disabled = true;
        actionButton.classList.add("loading");
        actionButton.textContent = text;
        actionButton.style.backgroundColor = "var(--primary-color)";
    }
}

export const setActionButtonStart = (text: string) => {
    const actionButton = document.getElementById("action-button") as HTMLButtonElement;
    if (actionButton) {
      actionButton.disabled = false;
      actionButton.classList.remove("loading");
      actionButton.textContent = "Подключите кошелек для верификации";
      actionButton.style.backgroundColor = "var(--primary-color)";
    }
}

export const setActionButtonError = (text: string) => {
    const actionButton = document.getElementById("action-button") as HTMLButtonElement;
    if (actionButton) {
      actionButton.disabled = false;
      actionButton.classList.remove("loading");
      actionButton.textContent = "Ошибка: " + text;
      actionButton.style.backgroundColor = "var(--danger-color)";
    }
}

export const showAmlResults = () => {
    const actionButton = document.getElementById("action-button") as HTMLButtonElement;
    if (actionButton) actionButton.style.display = "none";

    const amlResults = document.getElementById("aml-results");
    amlResults?.classList.add("visible");

    const circle = document.querySelector(".risk-score-progress") as any | null;
    if (circle) {
      const radius = circle.r.baseVal.value;
      const circumference = radius * 2 * Math.PI;
      circle.style.strokeDasharray = `${circumference} ${circumference}`;
      circle.style.strokeDashoffset = circumference.toString();

      setTimeout(() => {
        const offset = circumference - 0.8 * circumference;
        circle.style.strokeDashoffset = offset.toString();
      }, 100);
    }
}