import { describe, it, expect } from "vitest";
import {
  puedeTransicionar,
  transicionesDisponibles,
} from "@/lib/ticketStateMachine";

const CREADOR  = "user-creador";
const ASIGNADO = "user-asignado";
const OTRO     = "user-otro";

describe("puedeTransicionar", () => {

  describe("abierto → en_progreso (solo asignado)", () => {
    it("permite al asignado", () => {
      const r = puedeTransicionar("abierto", "en_progreso", ASIGNADO, CREADOR, ASIGNADO, false);
      expect(r.permitido).toBe(true);
    });

    it("rechaza al creador cuando no es el asignado", () => {
      const r = puedeTransicionar("abierto", "en_progreso", CREADOR, CREADOR, ASIGNADO, false);
      expect(r.permitido).toBe(false);
    });

    it("rechaza a un tercero aunque sea admin", () => {
      const r = puedeTransicionar("abierto", "en_progreso", OTRO, CREADOR, ASIGNADO, true);
      expect(r.permitido).toBe(false);
    });

    it("rechaza cuando el ticket no tiene asignado", () => {
      const r = puedeTransicionar("abierto", "en_progreso", CREADOR, CREADOR, null, false);
      expect(r.permitido).toBe(false);
      expect(r.razon).toMatch(/asignado/i);
    });
  });

  describe("en_progreso → resuelto (solo asignado)", () => {
    it("permite al asignado", () => {
      const r = puedeTransicionar("en_progreso", "resuelto", ASIGNADO, CREADOR, ASIGNADO, false);
      expect(r.permitido).toBe(true);
    });

    it("rechaza al creador si no es el asignado", () => {
      const r = puedeTransicionar("en_progreso", "resuelto", CREADOR, CREADOR, ASIGNADO, false);
      expect(r.permitido).toBe(false);
    });

    it("rechaza al admin si no es el asignado", () => {
      const r = puedeTransicionar("en_progreso", "resuelto", OTRO, CREADOR, ASIGNADO, true);
      expect(r.permitido).toBe(false);
    });
  });

  describe("resuelto → cerrado (creador o admin)", () => {
    it("permite al creador", () => {
      const r = puedeTransicionar("resuelto", "cerrado", CREADOR, CREADOR, ASIGNADO, false);
      expect(r.permitido).toBe(true);
    });

    it("permite al admin aunque no sea creador", () => {
      const r = puedeTransicionar("resuelto", "cerrado", OTRO, CREADOR, ASIGNADO, true);
      expect(r.permitido).toBe(true);
    });

    it("rechaza al asignado si no es creador ni admin", () => {
      const r = puedeTransicionar("resuelto", "cerrado", ASIGNADO, CREADOR, ASIGNADO, false);
      expect(r.permitido).toBe(false);
    });

    it("rechaza a un tercero sin privilegios", () => {
      const r = puedeTransicionar("resuelto", "cerrado", OTRO, CREADOR, ASIGNADO, false);
      expect(r.permitido).toBe(false);
    });
  });

  describe("transiciones no permitidas por el flujo estricto", () => {
    it("no permite saltar abierto → resuelto", () => {
      const r = puedeTransicionar("abierto", "resuelto", ASIGNADO, CREADOR, ASIGNADO, true);
      expect(r.permitido).toBe(false);
    });

    it("no permite saltar abierto → cerrado directamente", () => {
      const r = puedeTransicionar("abierto", "cerrado", CREADOR, CREADOR, ASIGNADO, true);
      expect(r.permitido).toBe(false);
    });

    it("no permite retroceder en_progreso → abierto", () => {
      const r = puedeTransicionar("en_progreso", "abierto", ASIGNADO, CREADOR, ASIGNADO, true);
      expect(r.permitido).toBe(false);
    });

    it("no permite retroceder resuelto → en_progreso", () => {
      const r = puedeTransicionar("resuelto", "en_progreso", ASIGNADO, CREADOR, ASIGNADO, true);
      expect(r.permitido).toBe(false);
    });

    it("no permite ninguna transición desde cerrado", () => {
      const r1 = puedeTransicionar("cerrado", "abierto",     CREADOR, CREADOR, ASIGNADO, true);
      const r2 = puedeTransicionar("cerrado", "en_progreso", CREADOR, CREADOR, ASIGNADO, true);
      const r3 = puedeTransicionar("cerrado", "resuelto",    CREADOR, CREADOR, ASIGNADO, true);
      expect(r1.permitido).toBe(false);
      expect(r2.permitido).toBe(false);
      expect(r3.permitido).toBe(false);
    });
  });

  describe("transicionesDisponibles", () => {
    it("desde abierto solo hay en_progreso", () => {
      expect(transicionesDisponibles("abierto")).toEqual(["en_progreso"]);
    });

    it("desde en_progreso solo hay resuelto", () => {
      expect(transicionesDisponibles("en_progreso")).toEqual(["resuelto"]);
    });

    it("desde resuelto solo hay cerrado", () => {
      expect(transicionesDisponibles("resuelto")).toEqual(["cerrado"]);
    });

    it("desde cerrado no hay transiciones", () => {
      expect(transicionesDisponibles("cerrado")).toEqual([]);
    });
  });
});
