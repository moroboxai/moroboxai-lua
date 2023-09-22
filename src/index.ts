export const VERSION = "__VERSION__";
import {
    lua_State,
    lua,
    lauxlib,
    to_luastring,
    to_jsstring
} from "fengari-web";

export function pushboolean(L: lua_State, b: boolean): void {
    lua.lua_pushboolean(L, b);
}

export function pushnumber(L: lua_State, n: number): void {
    lua.lua_pushnumber(L, n);
}

export function pushstring(L: lua_State, s: string): void {
    lua.lua_pushstring(L, to_luastring(s));
}

export function pushobject(L: lua_State, o: object): void {}

export function push(
    L: lua_State,
    o: boolean | number | string | object
): void {
    if (typeof o === "boolean") {
        pushboolean(L, o);
    } else if (typeof o === "number") {
        pushnumber(L, o);
    } else if (typeof o === "string") {
        pushstring(L, o);
    } else if (typeof o === "object") {
        pushobject(L, o);
    } else {
        throw `unknown type ${typeof o}`;
    }
}

export function getboolean(L: lua_State, i: number): boolean {
    return lua.lua_toboolean(L, i);
}

export function getnumber(L: lua_State, i: number): number {
    return lua.lua_tonumber(L, i);
}

export function getstring(L: lua_State, i: number): string {
    return lua.lua_tojsstring(L, i);
}

export function getobject(L: lua_State, i: number): any {
    return lua.lua_touserdata(L, i);
}

export function nargs(L: lua_State): number {
    return lua.lua_gettop(L);
}

export function getset(
    L: lua_State,
    h: string,
    a: number,
    b: number,
    get: () => number,
    set: () => void
): (o: lua_State) => number;

export function getset(
    L: lua_State,
    h: string,
    checkGet: (n: number) => boolean,
    checkSet: (n: number) => boolean,
    get: () => number,
    set: () => void
): (o: lua_State) => number;

export function getset(
    L: lua_State,
    h: string,
    a: number | ((n: number) => boolean),
    b: number | ((n: number) => boolean),
    get: () => number,
    set: () => void
): (o: lua_State) => number {
    if (typeof a === "number") {
        a = nargsEquals(a);
    }

    if (typeof b === "number") {
        b = nargsEquals(b);
    }

    return (_: lua_State) => {
        const size = nargs(L);
        if ((a as any)(size)) {
            return get();
        }

        if (!(b as any)(size)) {
            return lauxlib.luaL_error(to_luastring(h));
        }

        set();
        return 0;
    };
}

export function nargsEquals(n: number): (n: number) => boolean {
    return (_: number) => _ === n;
}

export function func(
    L: lua_State,
    h: string,
    n: number,
    call: () => number
): (o: lua_State) => number;

export function func(
    L: lua_State,
    h: string,
    check: (n: number) => boolean,
    call: () => number
): (o: lua_State) => number;

export function func(
    L: lua_State,
    h: string,
    n: number | ((n: number) => boolean),
    call: () => number
): (o: lua_State) => number {
    if (typeof n === "number") {
        n = nargsEquals(n);
    }

    return (_: lua_State) => {
        const size = nargs(L);
        if (!(n as any)(size)) {
            return lauxlib.luaL_error(to_luastring(h));
        }

        return call();
    };
}

export interface IVM {
    // State of the VM
    readonly luaState: lua_State;
}

class VM implements IVM {
    private _luaState: lua_State;

    get luaState(): lua_State {
        return this._luaState;
    }

    constructor(luaState: lua_State) {
        this._luaState = luaState;
    }
}

/**
 * Initialize a new Lua VM for running a script.
 * @param {object} options - options for the VM
 * @returns {any} - new Lua VM
 */
export function initLua(options: {
    globals?: { [key: string]: boolean | number | string | object };
    api?: { [key: string]: (o: lua_State) => number };
    script?: string;
}): IVM | undefined {
    const luaState: lua_State = lauxlib.luaL_newstate();

    const setnameval = function (name: string, val: any) {
        push(luaState, val);
        lua.lua_setglobal(luaState, to_luastring(name));
    };

    if (options.globals !== undefined) {
        Object.entries(options.globals).forEach(([key, value]) => {
            setnameval(key, value);
        });
    }

    if (options.api !== undefined) {
        Object.entries(options.api).forEach(([k, v]) => {
            lua.lua_register(luaState, k, (_: lua_State) => {
                try {
                    return v(_);
                } catch (e) {
                    throw new Error(`error in ${k} implementation: ${e}`);
                }
            });
        });
    }

    if (options.script !== undefined) {
        if (
            lauxlib.luaL_dostring(luaState, to_luastring(options.script)) !=
            lua.LUA_OK
        ) {
            console.error(to_jsstring(lua.lua_tostring(luaState, -1)));
            return undefined;
        }
    }

    return new VM(luaState);
}
