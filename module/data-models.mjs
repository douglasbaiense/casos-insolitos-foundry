const {
  HTMLField,
  NumberField,
  SchemaField,
  StringField,
  BooleanField
} = foundry.data.fields;

const text = (initial = "") => new StringField({ required: true, blank: true, initial });

export class InvestigatorDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      caseNumber: text(),
      sessionDate: text(),
      age: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
      gender: text(),
      appearance: text(),
      history: new HTMLField({ required: true, blank: true, initial: "" }),
      specialization: text(),
      virtue: text(),
      flaw: text(),
      trauma: text(),
      anchor: text(),
      hp: new SchemaField({
        value: new NumberField({ required: true, integer: true, min: 0, max: 10, initial: 10 }),
        max: new NumberField({ required: true, integer: true, min: 1, max: 10, initial: 10 })
      }),
      sanity: new SchemaField({
        value: new NumberField({ required: true, integer: true, min: 0, max: 10, initial: 10 }),
        max: new NumberField({ required: true, integer: true, min: 1, max: 10, initial: 10 })
      }),
      states: new SchemaField({
        dying: new BooleanField({ required: true, initial: false }),
        debilitated: new BooleanField({ required: true, initial: false }),
        temporaryInsanity: new BooleanField({ required: true, initial: false }),
        anchorLost: new BooleanField({ required: true, initial: false }),
        adrift: new BooleanField({ required: true, initial: false })
      }),
      anchorFate: text(),
      clues: new HTMLField({ required: true, blank: true, initial: "" }),
      notes: new HTMLField({ required: true, blank: true, initial: "" })
    };
  }
}


export class NPCDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      caseNumber: text(),
      sessionDate: text(),
      age: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
      gender: text(),
      appearance: text(),
      history: new HTMLField({ required: true, blank: true, initial: "" }),
      specialization: text(),
      hp: new SchemaField({
        value: new NumberField({ required: true, integer: true, min: 0, max: 10, initial: 10 }),
        max: new NumberField({ required: true, integer: true, min: 1, max: 10, initial: 10 })
      }),
      sanity: new SchemaField({
        value: new NumberField({ required: true, integer: true, min: 0, max: 10, initial: 10 }),
        max: new NumberField({ required: true, integer: true, min: 1, max: 10, initial: 10 })
      }),
      presence: new StringField({ required: true, choices: ["mundane", "forte", "profundo", "devastador"], initial: "mundane" }),
      sanityResistance: new StringField({ required: true, choices: ["mundano", "iniciado", "cultista", "insolito"], initial: "mundano" }),
      damageResistance: new StringField({ required: true, choices: ["mundano", "resistente", "insolito", "insolito-anciao"], initial: "mundano" }),
      states: new SchemaField({
        dying: new BooleanField({ required: true, initial: false }),
        debilitated: new BooleanField({ required: true, initial: false }),
        temporaryInsanity: new BooleanField({ required: true, initial: false })
      }),
      notes: new HTMLField({ required: true, blank: true, initial: "" })
    };
  }
}

export class EquipmentDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      description: new HTMLField({ required: true, blank: true, initial: "" }),
      carried: new BooleanField({ required: true, initial: true }),
      evidence: new BooleanField({ required: true, initial: false }),
      quantity: new NumberField({ required: true, integer: true, min: 1, initial: 1 })
    };
  }
}

export class AbilityDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      abilityType: new StringField({ required: true, choices: ["item", "ritual", "power"], initial: "power" }),
      target: new StringField({ required: true, choices: ["self", "adjacent", "distant"], initial: "self" }),
      damage: new StringField({ required: true, choices: ["0", "1d6", "2d6", "3d6", "4d6"], initial: "0" }),
      description: new HTMLField({ required: true, blank: true, initial: "" })
    };
  }
}

export class WeaponDataModel extends EquipmentDataModel {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      weaponType: new StringField({
        required: true,
        choices: ["firearm", "melee"],
        initial: "firearm"
      }),
      damage: new StringField({
        required: true,
        choices: ["1d6", "2d6", "3d6", "4d6"],
        initial: "1d6"
      }),
      prepared: new BooleanField({ required: true, initial: false })
    };
  }
}
