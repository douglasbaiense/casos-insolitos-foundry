const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

export class CasosItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["casos-insolitos", "ci-item-sheet"],
    position: { width: 540, height: 650 },
    window: { icon: "fa-solid fa-box-open", resizable: true },
    form: { closeOnSubmit: false, submitOnChange: false },
    actions: {
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

  async _onRender(context, options) {
    await super._onRender(context, options);
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

  async #saveFromForm(form) {
    const data = new FormData(form);
    const update = {
      name: data.get("name")?.toString() ?? this.item.name,
      "system.description": data.get("system.description")?.toString() ?? "",
      "system.carried": data.has("system.carried"),
      "system.evidence": data.has("system.evidence")
    };
    if (this.item.type === "equipment") {
      update["system.quantity"] = Math.max(1, Number(this.item.system.quantity ?? 1));
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
    await this.item.update(update, { render: false });
    const parentSheet = this.item.parent?.sheet;
    if (parentSheet?.rememberViewState) parentSheet.rememberViewState();
    await this.close();
    if (parentSheet?.refreshPreservingView) await parentSheet.refreshPreservingView();
    ui.notifications.info("Item salvo.");
  }

  static async #saveItem(event, target) {
    const form = this.element?.querySelector("form");
    if (form) await this.#saveFromForm(form);
  }

  static async #cancelItem() {
    await this.close();
  }
}
