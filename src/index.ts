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

export function pusharray(L: lua_State, s: any[]): void {
    lua.lua_newtable(L);
    s.forEach((val, index) => {
        push(L, val);
        lua.lua_rawseti(L, -2, index + 1);
    });
}

export function pushobject(L: lua_State, o: object): void {
    lua.lua_newtable(L);
    Object.entries(o).forEach(([key, value]) => {
        push(L, value);
        lua.lua_setfield(L, -2, key);
    });
}

export function push(L: lua_State, o: any): void {
    if (typeof o === "boolean") {
        pushboolean(L, o);
    } else if (typeof o === "number") {
        pushnumber(L, o);
    } else if (typeof o === "string") {
        pushstring(L, o);
    } else if (Array.isArray(o)) {
        pusharray(L, o);
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
    lua.lua_pushnil(L); /* first key */

    const d: { [key: string]: any } = {};
    while (lua.lua_next(L, -2) != 0) {
        /* uses 'key' (at index -2) and 'value' (at index -1) */
        d[getstring(L, -2)] = get(L, -1);
        /* removes 'value'; keeps 'key' for next iteration */
        lua.lua_pop(L, 1);
    }

    return d;
}

export function gettable(L: lua_State, i: number): any {
    const len = lua.lua_rawlen(L, i);
    if (len === 0) {
        return getobject(L, i);
    }

    const a: any[] = [];
    for (let j = 0; j < len; ++j) {
        lua.lua_rawgeti(L, -1, j + 1);
        if (lua.lua_isnil(L, -1)) {
            // Try to read an object
            lua.lua_pop(L, 1);
            return getobject(L, i);
        }

        a.push(get(L, -1));
        lua.lua_pop(L, 1);
    }

    return a;
}

export function popstring(L: lua_State): string {
    return lua.lua_tojsstring(L, -1);
}

export function pop(L: lua_State): any {
    const val = get(L, -1);
    lua.lua_pop(L, 1);
    return val;
}

export function get(L: lua_State, i: number): any {
    if (lua.lua_isnil(L, i)) {
        return undefined;
    } else if (lua.lua_isboolean(L, i)) {
        return getboolean(L, i);
    } else if (lua.lua_isnumber(L, i)) {
        return getnumber(L, i);
    } else if (lua.lua_isstring(L, i)) {
        return getstring(L, i);
    } else if (lua.lua_istable(L, i)) {
        return gettable(L, i);
    } else {
        throw `unknown type ${lua.lua_typename(L, lua.lua_type(L, i))}`;
    }
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
    h: string,
    n: number,
    call: (L: lua_State) => number
): (L: lua_State) => number;

export function func(
    h: string,
    check: (n: number) => boolean,
    call: (L: lua_State) => number
): (L: lua_State) => number;

export function func(
    h: string,
    n: number | ((n: number) => boolean),
    call: (L: lua_State) => number
): (L: lua_State) => number {
    if (typeof n === "number") {
        n = nargsEquals(n);
    }

    return (L: lua_State) => {
        const size = nargs(L);
        if (!(n as any)(size)) {
            return lauxlib.luaL_error(to_luastring(h));
        }

        return call(L);
    };
}

export function call(L: lua_State, name: string, ...args: any[]) {
    lua.lua_getglobal(L, to_luastring(name, true));
    args.forEach((arg) => {
        push(L, arg);
    });
    if (lua.lua_call(L, args.length, 1) !== lua.LUA_OK) {
        const err = getstring(L, -1);
        if (err) {
            throw new Error(err);
        }
    }
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
            console.log("register Lua global", key);
            setnameval(key, value);
        });
    }

    if (options.api !== undefined) {
        Object.entries(options.api).forEach(([k, v]) => {
            console.log("register Lua api", k);
            lua.lua_register(luaState, k, (L: lua_State) => {
                try {
                    return v(L);
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
