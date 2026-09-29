const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

/** Converte HTML em texto simples (usado nas prévias de descrição das listas). */
export function htmlToPlainText(html = "") {
  const doc = new DOMParser().parseFromString(String(html ?? ""), "text/html");
  return (doc.body.textContent ?? "").replace(/\s+/g, " ").trim();
}

/** Retorna o caminho do ícone somente se ele foi personalizado (diferente do padrão do Foundry). */
export function customItemImg(item) {
  const fallback = item.constructor?.DEFAULT_ICON ?? "icons/svg/item-bag.svg";
  return item.img && item.img !== fallback ? item.img : "";
}

export class CasosItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["casos-insolitos", "ci-item-sheet"],
    position: { width: 760, height: 780 },
    window: { icon: "fa-solid fa-box-open", resizable: true },
    form: { closeOnSubmit: false, submitOnChange: false },
    actions: {
      editImage: CasosItemSheet.#editImage,
      saveItem: CasosItemSheet.#saveItem,
      cancelItem: CasosItemSheet.#cancelItem
    }
  };

  get title() {
    const labels = { weapon: "Weapon", ability: "Habilidade Insólita", equipment: "Equipamento" };
    return `${labels[this.item.type] ?? "Item"}: ${this.item.name}`;
  }

  static PARTS = {
    form: { template: "systems/casos-insolitos/templates/item-sheet.hbs", scrollable: [".ci-item-scroll"] }
  };

  /** Ícone escolhido no seletor, ainda não gravado (só é gravado ao clicar em Salvar). */
  #pendingImg = null;

  async _onRender(context, options) {
    await super._onRender(context, options);
    if (this.#pendingImg) {
      const icon = this.element?.querySelector('img[data-edit="img"]');
      if (icon) icon.src = this.#pendingImg;
    }
    // Clicar em qualquer ponto da área da descrição coloca o cursor no editor.
    const editorArea = this.element?.querySelector("prose-mirror .editor-content");
    if (editorArea && !editorArea.dataset.ciFocus) {
      editorArea.dataset.ciFocus = "true";
      editorArea.addEventListener("click", (event) => {
        const pm = editorArea.querySelector(".ProseMirror");
        if (pm && !pm.contains(event.target)) pm.focus();
      });
    }
    const form = this.element?.querySelector("form");
    if (!form || form.dataset.ciBound) return;
    form.dataset.ciBound = "true";
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      await this.#saveFromForm(form);
    });
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    return {
      ...context,
      item: this.item,
      system: this.item.system,
      descriptionHTML: this.#descriptionForEditor(),
      isWeapon: this.item.type === "weapon",
      isAbility: this.item.type === "ability",
      weaponTypes: [
        { value: "firearm", label: "Arma de fogo", selected: this.item.system.weaponType === "firearm" },
        { value: "melee", label: "Arma branca", selected: this.item.system.weaponType === "melee" }
      ],
      abilityTypes: [
        { value: "item", label: "Item", selected: this.item.system.abilityType === "item" },
        { value: "ritual", label: "Ritual", selected: this.item.system.abilityType === "ritual" },
        { value: "power", label: "Poder", selected: this.item.system.abilityType === "power" }
      ],
      targetTypes: [
        { value: "self", label: "Próprio", selected: this.item.system.target === "self" },
        { value: "adjacent", label: "Adjacente", selected: this.item.system.target === "adjacent" },
        { value: "distant", label: "Distante", selected: this.item.system.target === "distant" }
      ],
      abilityDamageTypes: [
        { value: "0", label: "Sem Dano", selected: this.item.system.damage === "0", tone: "none" },
        { value: "1d6", label: "Baixa periculosidade", selected: this.item.system.damage === "1d6", tone: "low" },
        { value: "2d6", label: "Média periculosidade", selected: this.item.system.damage === "2d6", tone: "medium" },
        { value: "3d6", label: "Alta periculosidade", selected: this.item.system.damage === "3d6", tone: "high" },
        { value: "4d6", label: "Altíssima periculosidade", selected: this.item.system.damage === "4d6", tone: "extreme" }
      ],
      damageTypes: [
        { value: "1d6", label: "Baixa periculosidade", selected: this.item.system.damage === "1d6", tone: "low" },
        { value: "2d6", label: "Média periculosidade", selected: this.item.system.damage === "2d6", tone: "medium" },
        { value: "3d6", label: "Alta periculosidade", selected: this.item.system.damage === "3d6", tone: "high" },
        { value: "4d6", label: "Altíssima periculosidade", selected: this.item.system.damage === "4d6", tone: "extreme" }
      ]
    };
  }

  /** Descrições antigas eram texto puro: preserva as quebras de linha ao abrir no editor. */
  #descriptionForEditor() {
    const raw = String(this.item.system.description ?? "");
    if (!raw || /<[a-z][\s\S]*>/i.test(raw)) return raw;
    const escaped = raw.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return `<p>${escaped.replace(/\r?\n/g, "<br>")}</p>`;
  }

  /** Lê o HTML do editor de descrição, confirmando antes o que foi digitado. */
  #readDescription(form, data) {
    const editor = form.querySelector('prose-mirror[name="system.description"]');
    if (editor) {
      const saveButton = editor.querySelector('[data-action="save"]');
      if (saveButton) {
        saveButton.click();
        if (typeof editor.value === "string") return editor.value;
      } else {
        const content = editor.querySelector(".ProseMirror");
        if (content) {
          const clone = content.cloneNode(true);
          clone.querySelectorAll(".ProseMirror-trailingBreak").forEach(node => node.remove());
          return clone.innerHTML;
        }
        if (typeof editor.value === "string") return editor.value;
      }
    }
    return data.get("system.description")?.toString() ?? "";
  }

  async #saveFromForm(form) {
    const data = new FormData(form);
    const update = {
      name: data.get("name")?.toString() ?? this.item.name,
      "system.description": this.#readDescription(form, data),
      "system.carried": data.has("system.carried"),
      "system.evidence": data.has("system.evidence")
    };
    if (this.item.type === "equipment") {
      update["system.quantity"] = Math.max(1, Math.floor(Number(data.get("system.quantity")) || Number(this.item.system.quantity ?? 1)));
    }
    if (this.item.type === "ability") {
      update["system.abilityType"] = data.get("system.abilityType")?.toString() || "power";
      update["system.target"] = data.get("system.target")?.toString() || "self";
      update["system.damage"] = data.get("system.damage")?.toString() || "0";
    }
    if (this.item.type === "weapon") {
      update["system.weaponType"] = data.get("system.weaponType")?.toString() || "firearm";
      update["system.damage"] = data.get("system.damage")?.toString() || "1d6";
    }
    if (this.#pendingImg && this.#pendingImg !== this.item.img) update.img = this.#pendingImg;
    await this.item.update(update, { render: false });
    this.#pendingImg = null;
    // Itens do mundo (aba Itens da barra lateral): como a atualização acima não
    // renderiza, atualiza a lista para mostrar o novo ícone/nome.
    if (!this.item.parent && !this.item.pack) ui.items?.render();
    const parentSheet = this.item.parent?.sheet;
    if (parentSheet?.rememberViewState) parentSheet.rememberViewState();
    await this.close();
    if (parentSheet?.refreshPreservingView) await parentSheet.refreshPreservingView();
    ui.notifications.info("Item salvo.");
  }

  static async #editImage(event, target) {
    const FilePickerClass = foundry.applications.apps?.FilePicker?.implementation
      ?? foundry.applications.apps?.FilePicker
      ?? globalThis.FilePicker;
    const picker = new FilePickerClass({
      type: "image",
      current: this.#pendingImg ?? this.item.img,
      callback: (path) => {
        this.#pendingImg = path;
        const icon = this.element?.querySelector('img[data-edit="img"]');
        if (icon) icon.src = path;
      }
    });
    return picker.browse();
  }

  static async #saveItem(event, target) {
    const form = this.element?.querySelector("form");
    if (form) await this.#saveFromForm(form);
  }

  static async #cancelItem() {
    await this.close();
  }
}
