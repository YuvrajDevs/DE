"""A teaching-grade, in-browser implementation of the PySpark DataFrame API.

It runs on plain Python (inside Pyodide) over lists of rows, so it is NOT
distributed - but the API surface, null semantics, default window frames,
column naming, show()/printSchema()/explain() output and lazy-vs-action
vocabulary follow real Spark closely enough that code you write here runs
unchanged on a real cluster (Databricks, EMR, Synapse, local pyspark).

Supported: SparkSession, spark.table/sql/createDataFrame/range, DataFrame
select/withColumn/filter/where/groupBy/agg/pivot/join (all join types incl.
semi/anti/cross, broadcast hint, aliases for self-joins)/orderBy/distinct/
dropDuplicates/union/unionByName/fillna/dropna/limit/explode/cache/repartition/
coalesce/explain/show/collect/count/printSchema/createOrReplaceTempView,
Window functions (row_number, rank, dense_rank, ntile, percent_rank, lag, lead,
running aggregates, rowsBetween), ~80 pyspark.sql.functions, UDFs, types.
"""
import builtins as _b
import datetime as _dt
import hashlib as _hl
import json as _json
import math as _math
import re as _re
import sys as _sys
import types as _types

_py_sum, _py_min, _py_max, _py_round, _py_abs = _b.sum, _b.min, _b.max, _b.round, _b.abs

# ----------------------------------------------------------------- helpers

class AnalysisException(Exception):
    pass


def _to_date(v):
    if v is None:
        return None
    if isinstance(v, _dt.datetime):
        return v.date()
    if isinstance(v, _dt.date):
        return v
    s = str(v).strip()
    try:
        return _dt.date.fromisoformat(s[:10])
    except ValueError:
        return None


def _to_ts(v):
    if v is None:
        return None
    if isinstance(v, _dt.datetime):
        return v
    if isinstance(v, _dt.date):
        return _dt.datetime(v.year, v.month, v.day)
    s = str(v).strip().replace("T", " ")
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d %H:%M:%S.%f", "%Y-%m-%d"):
        try:
            return _dt.datetime.strptime(s, fmt)
        except ValueError:
            pass
    return None


def _coerce_pair(a, b):
    """Spark implicitly casts string <-> date/timestamp and int <-> double."""
    if isinstance(a, _dt.datetime) and isinstance(b, str):
        return a, _to_ts(b)
    if isinstance(b, _dt.datetime) and isinstance(a, str):
        return _to_ts(a), b
    if isinstance(a, _dt.date) and not isinstance(a, _dt.datetime) and isinstance(b, str):
        return a, _to_date(b)
    if isinstance(b, _dt.date) and not isinstance(b, _dt.datetime) and isinstance(a, str):
        return _to_date(a), b
    if isinstance(a, bool) or isinstance(b, bool):
        return a, b
    if isinstance(a, (int, float)) and isinstance(b, str):
        try:
            return a, float(b)
        except ValueError:
            return str(a), b
    if isinstance(b, (int, float)) and isinstance(a, str):
        try:
            return float(a), b
        except ValueError:
            return a, str(b)
    return a, b


def _sort_key(v):
    if v is None:
        return (0, 0)
    if isinstance(v, bool):
        return (1, int(v))
    if isinstance(v, (int, float)):
        return (1, v)
    if isinstance(v, _dt.datetime):
        return (2, v.isoformat(" "))
    if isinstance(v, _dt.date):
        return (2, v.isoformat())
    if isinstance(v, (list, tuple)):
        return (4, tuple(_sort_key(x) for x in v))
    return (3, str(v))


def _hashable(v):
    if isinstance(v, list):
        return ("__list__",) + tuple(_hashable(x) for x in v)
    if isinstance(v, dict):
        return ("__dict__",) + tuple(sorted((k, _hashable(x)) for k, x in v.items()))
    if isinstance(v, float) and v == int(v) and _py_abs(v) < 1e15:
        return int(v)
    return v


def _fmt(v):
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, float):
        if v == int(v) and _py_abs(v) < 1e15:
            return f"{v:.1f}"
        return repr(_py_round(v, 10))
    if isinstance(v, _dt.datetime):
        return v.strftime("%Y-%m-%d %H:%M:%S")
    if isinstance(v, _dt.date):
        return v.isoformat()
    if isinstance(v, list):
        return "[" + ", ".join(_fmt(x) for x in v) + "]"
    if isinstance(v, dict):
        return "{" + ", ".join(f"{k} -> {_fmt(x)}" for k, x in v.items()) + "}"
    return str(v)


def _type_of(values):
    for v in values:
        if v is None:
            continue
        if isinstance(v, bool):
            return "boolean"
        if isinstance(v, int):
            return "bigint" if _py_abs(v) > 2 ** 31 else "int"
        if isinstance(v, float):
            return "double"
        if isinstance(v, _dt.datetime):
            return "timestamp"
        if isinstance(v, _dt.date):
            return "date"
        if isinstance(v, list):
            inner = _type_of(v)
            return f"array<{inner}>"
        if isinstance(v, dict):
            return "map<string,string>"
        return "string"
    return "string"


# ----------------------------------------------------------------- Row

class Row(tuple):
    def __new__(cls, *args, **kwargs):
        if kwargs and not args:
            r = tuple.__new__(cls, kwargs.values())
            r.__fields__ = list(kwargs.keys())
            return r
        r = tuple.__new__(cls, args)
        r.__fields__ = None
        return r

    @classmethod
    def _make(cls, fields, values):
        r = tuple.__new__(cls, values)
        r.__fields__ = list(fields)
        return r

    def __getattr__(self, item):
        f = tuple.__getattribute__(self, "__dict__").get("__fields__")
        if f and item in f:
            return self[f.index(item)]
        raise AttributeError(item)

    def __getitem__(self, item):
        if isinstance(item, str):
            return tuple.__getitem__(self, self.__fields__.index(item))
        return tuple.__getitem__(self, item)

    def asDict(self, recursive=False):
        return dict(zip(self.__fields__, self))

    def __call__(self, *values):  # Row("a","b")(1,2) style
        return Row._make(list(self), values)

    def __repr__(self):
        if self.__fields__:
            return "Row(" + ", ".join(f"{k}={v!r}" for k, v in zip(self.__fields__, self)) + ")"
        return "<Row(" + ", ".join(repr(v) for v in self) + ")>"


# ----------------------------------------------------------------- types

class DataType:
    name = "string"

    def simpleString(self):
        return self.name

    def __repr__(self):
        return type(self).__name__ + "()"

    def __eq__(self, o):
        return type(self) is type(o)

    def __hash__(self):
        return hash(type(self).__name__)


def _mk(name, sname):
    return type(name, (DataType,), {"name": sname})


StringType = _mk("StringType", "string")
IntegerType = _mk("IntegerType", "int")
LongType = _mk("LongType", "bigint")
ShortType = _mk("ShortType", "smallint")
DoubleType = _mk("DoubleType", "double")
FloatType = _mk("FloatType", "float")
BooleanType = _mk("BooleanType", "boolean")
DateType = _mk("DateType", "date")
TimestampType = _mk("TimestampType", "timestamp")
BinaryType = _mk("BinaryType", "binary")


class DecimalType(DataType):
    def __init__(self, precision=10, scale=0):
        self.precision, self.scale = precision, scale
        self.name = f"decimal({precision},{scale})"


class ArrayType(DataType):
    def __init__(self, elementType, containsNull=True):
        self.elementType = elementType
        self.name = f"array<{elementType.simpleString()}>"


class StructField:
    def __init__(self, name, dataType, nullable=True, metadata=None):
        self.name, self.dataType, self.nullable = name, dataType, nullable

    def __repr__(self):
        return f"StructField('{self.name}', {self.dataType!r}, {self.nullable})"


class StructType(DataType):
    name = "struct"

    def __init__(self, fields=None):
        self.fields = list(fields or [])

    def add(self, name, dataType, nullable=True):
        self.fields.append(StructField(name, dataType if isinstance(dataType, DataType) else _parse_type(dataType), nullable))
        return self

    @property
    def names(self):
        return [f.name for f in self.fields]

    def __iter__(self):
        return iter(self.fields)

    def __repr__(self):
        return "StructType([" + ", ".join(repr(f) for f in self.fields) + "])"


_TYPE_ALIASES = {
    "string": StringType, "str": StringType, "varchar": StringType, "int": IntegerType, "integer": IntegerType,
    "bigint": LongType, "long": LongType, "smallint": ShortType, "double": DoubleType, "float": FloatType,
    "real": DoubleType, "boolean": BooleanType, "bool": BooleanType, "date": DateType, "timestamp": TimestampType,
}


def _parse_type(t):
    if isinstance(t, DataType):
        return t
    if isinstance(t, type) and issubclass(t, DataType):
        return t()
    s = str(t).strip().lower()
    m = _re.match(r"decimal\((\d+)\s*,\s*(\d+)\)", s)
    if m:
        return DecimalType(int(m.group(1)), int(m.group(2)))
    if s in _TYPE_ALIASES:
        return _TYPE_ALIASES[s]()
    raise AnalysisException(f"[UNSUPPORTED_DATATYPE] Unsupported data type \"{t}\".")


def _cast(v, t):
    t = _parse_type(t)
    if v is None:
        return None
    try:
        if isinstance(t, StringType):
            return _fmt(v) if not isinstance(v, str) else v
        if isinstance(t, (IntegerType, LongType, ShortType)):
            if isinstance(v, str):
                v = v.strip()
                return int(float(v)) if v else None
            if isinstance(v, (_dt.date,)):
                return None
            return int(v)
        if isinstance(t, (DoubleType, FloatType)):
            return float(v)
        if isinstance(t, DecimalType):
            return _py_round(float(v), t.scale)
        if isinstance(t, BooleanType):
            if isinstance(v, str):
                return {"true": True, "false": False, "1": True, "0": False}.get(v.strip().lower())
            return bool(v)
        if isinstance(t, DateType):
            return _to_date(v)
        if isinstance(t, TimestampType):
            return _to_ts(v)
    except (ValueError, TypeError):
        return None  # Spark (non-ANSI) returns NULL on a failed cast
    return v


# ----------------------------------------------------------------- Column expressions

class _Ctx:
    """Evaluation context: one row (dict) plus, inside aggregation, the group's rows."""
    __slots__ = ("row", "group")

    def __init__(self, row, group=None):
        self.row, self.group = row, group


class Column:
    _is_agg = False
    _is_window = False

    def __init__(self, fn, name, children=(), kind="expr"):
        self._fn = fn
        self._name = name
        self._children = list(children)
        self._kind = kind
        self._sort = None  # (ascending, nulls_first)
        self._over = None

    # -- evaluation
    def _ev(self, ctx):
        return self._fn(ctx)

    def _contains_agg(self):
        return self._is_agg or _py_sum(1 for c in self._children if isinstance(c, Column) and c._contains_agg()) > 0

    def _windows(self):
        out = []
        if self._is_window:
            out.append(self)
        for c in self._children:
            if isinstance(c, Column):
                out.extend(c._windows())
        return out

    def __repr__(self):
        return f"Column<'{self._name}'>"

    def __str__(self):
        return self._name

    def __bool__(self):
        raise ValueError("Cannot convert column into bool: please use '&' for 'and', '|' for 'or', '~' for 'not' when building DataFrame boolean expressions.")

    def __iter__(self):
        raise TypeError("Column is not iterable")

    # -- naming
    def alias(self, *names, **kw):
        c = Column(self._fn, names[0], [self], self._kind)
        c._is_agg, c._is_window = False, False
        c._children = [self]
        c._fn = lambda ctx, s=self: s._ev(ctx)
        c._alias_of = self
        return c

    name = alias

    # -- sorting
    def asc(self):
        c = _wrap(self, self._name)
        c._sort = (True, True)
        return c

    def desc(self):
        c = _wrap(self, self._name)
        c._sort = (False, False)
        return c

    def asc_nulls_first(self):
        c = _wrap(self, self._name); c._sort = (True, True); return c

    def asc_nulls_last(self):
        c = _wrap(self, self._name); c._sort = (True, False); return c

    def desc_nulls_first(self):
        c = _wrap(self, self._name); c._sort = (False, True); return c

    def desc_nulls_last(self):
        c = _wrap(self, self._name); c._sort = (False, False); return c

    # -- null / membership
    def isNull(self):
        return _un(self, lambda a: a is None, f"({self._name} IS NULL)", null_safe=True)

    def isNotNull(self):
        return _un(self, lambda a: a is not None, f"({self._name} IS NOT NULL)", null_safe=True)

    def isin(self, *vals):
        if len(vals) == 1 and isinstance(vals[0], (list, tuple, set)):
            vals = tuple(vals[0])

        def f(a):
            hits = [x for x in vals if x is not None]
            for x in hits:
                p, q = _coerce_pair(a, x)
                if p == q:
                    return True
            return None if any(x is None for x in vals) else False
        return _un(self, f, f"({self._name} IN ({', '.join(_fmt(v) for v in vals)}))")

    def between(self, lo, hi):
        return (self >= lo) & (self <= hi)

    def eqNullSafe(self, other):
        o = _lit_if(other)
        return Column(lambda ctx: _coerce_pair(self._ev(ctx), o._ev(ctx))[0] == _coerce_pair(self._ev(ctx), o._ev(ctx))[1],
                      f"({self._name} <=> {o._name})", [self, o])

    # -- strings
    def like(self, pat):
        rx = "^" + _re.escape(pat).replace("%", ".*").replace("_", ".") + "$"
        rx = rx.replace("\\%", ".*").replace("\\_", ".")
        return _un(self, lambda a: _re.match(rx, str(a), _re.S) is not None, f"{self._name} LIKE {pat}")

    def ilike(self, pat):
        rx = "^" + _re.escape(pat.lower()).replace("%", ".*").replace("_", ".") + "$"
        rx = rx.replace("\\%", ".*").replace("\\_", ".")
        return _un(self, lambda a: _re.match(rx, str(a).lower(), _re.S) is not None, f"{self._name} ILIKE {pat}")

    def rlike(self, pat):
        return _un(self, lambda a: _re.search(pat, str(a)) is not None, f"{self._name} RLIKE {pat}")

    def contains(self, s):
        o = _lit_if(s)
        return _bin(self, o, lambda a, b: str(b) in str(a), f"contains({self._name}, {o._name})")

    def startswith(self, s):
        return _un(self, lambda a: str(a).startswith(s), f"startswith({self._name}, {s})")

    def endswith(self, s):
        return _un(self, lambda a: str(a).endswith(s), f"endswith({self._name}, {s})")

    def substr(self, start, length):
        return substring(self, start, length)

    def cast(self, t):
        tt = _parse_type(t)
        return _un(self, lambda a: _cast(a, tt), f"CAST({self._name} AS {tt.simpleString().upper()})", null_safe=False)

    astype = cast

    def getItem(self, k):
        def f(a):
            try:
                return a[k]
            except (IndexError, KeyError, TypeError):
                return None
        return _un(self, f, f"{self._name}[{k}]")

    def __getitem__(self, k):
        return self.getItem(k)

    def getField(self, k):
        return self.getItem(k)

    # -- conditional (only valid on a when() column)
    def when(self, cond, value):
        if not getattr(self, "_branches", None):
            raise AnalysisException("when() can only be applied on a Column previously generated by when() function")
        return _make_when(self._branches + [(cond, _lit_if(value))], None)

    def otherwise(self, value):
        if not getattr(self, "_branches", None):
            raise AnalysisException("otherwise() can only be applied on a Column previously generated by when() function")
        return _make_when(self._branches, _lit_if(value))

    # -- window
    def over(self, window):
        if not (self._is_agg or getattr(self, "_winfn", None)):
            raise AnalysisException(f"Expression '{self._name}' is not supported within a window function.")
        c = Column(None, f"{self._name} OVER ({window._desc()})", [self])
        c._is_window = True
        c._win = window
        c._inner = self
        c._key = f"__w{id(c)}"
        c._fn = lambda ctx, k=c._key: ctx.row.get(k)
        return c

    # -- operators
    def __add__(self, o): return _arith(self, o, lambda a, b: a + b, "+")
    def __radd__(self, o): return _arith(_lit_if(o), self, lambda a, b: a + b, "+")
    def __sub__(self, o): return _arith(self, o, lambda a, b: a - b, "-")
    def __rsub__(self, o): return _arith(_lit_if(o), self, lambda a, b: a - b, "-")
    def __mul__(self, o): return _arith(self, o, lambda a, b: a * b, "*")
    def __rmul__(self, o): return _arith(_lit_if(o), self, lambda a, b: a * b, "*")
    def __truediv__(self, o): return _arith(self, o, lambda a, b: None if b == 0 else a / b, "/")
    def __rtruediv__(self, o): return _arith(_lit_if(o), self, lambda a, b: None if b == 0 else a / b, "/")
    def __mod__(self, o): return _arith(self, o, lambda a, b: None if b == 0 else _math.fmod(a, b), "%")
    def __neg__(self): return _un(self, lambda a: -a, f"(- {self._name})")
    def __eq__(self, o): return _cmp(self, o, lambda a, b: a == b, "=")
    def __ne__(self, o): return _cmp(self, o, lambda a, b: a != b, "!=")
    def __lt__(self, o): return _cmp(self, o, lambda a, b: a < b, "<")
    def __le__(self, o): return _cmp(self, o, lambda a, b: a <= b, "<=")
    def __gt__(self, o): return _cmp(self, o, lambda a, b: a > b, ">")
    def __ge__(self, o): return _cmp(self, o, lambda a, b: a >= b, ">=")
    __hash__ = object.__hash__

    def __and__(self, o):
        o = _lit_if(o)

        def f(ctx):
            a, b = self._ev(ctx), o._ev(ctx)
            if a is False or b is False:
                return False
            if a is None or b is None:
                return None
            return bool(a) and bool(b)
        return Column(f, f"({self._name} AND {o._name})", [self, o])

    def __or__(self, o):
        o = _lit_if(o)

        def f(ctx):
            a, b = self._ev(ctx), o._ev(ctx)
            if a is True or b is True:
                return True
            if a is None or b is None:
                return None
            return bool(a) or bool(b)
        return Column(f, f"({self._name} OR {o._name})", [self, o])

    __rand__ = __and__
    __ror__ = __or__

    def __invert__(self):
        return _un(self, lambda a: not a, f"(NOT {self._name})")


def _wrap(col, name):
    c = Column(lambda ctx, s=col: s._ev(ctx), name, [col])
    c._srcname = getattr(col, "_srcname", None)
    return c


def _lit_if(v):
    return v if isinstance(v, Column) else lit(v)


def _un(c, f, name, null_safe=False):
    def g(ctx):
        a = c._ev(ctx)
        if a is None and not null_safe:
            return None
        return f(a)
    return Column(g, name, [c])


def _bin(a, b, f, name):
    b = _lit_if(b)

    def g(ctx):
        x, y = a._ev(ctx), b._ev(ctx)
        if x is None or y is None:
            return None
        return f(x, y)
    return Column(g, name, [a, b])


def _arith(a, b, f, op):
    b = _lit_if(b)

    def g(ctx):
        x, y = a._ev(ctx), b._ev(ctx)
        if x is None or y is None:
            return None
        if isinstance(x, str) or isinstance(y, str):
            try:
                x, y = float(x), float(y)
            except (TypeError, ValueError):
                return None
        if isinstance(x, _dt.date) or isinstance(y, _dt.date):
            if isinstance(x, _dt.date) and isinstance(y, int):
                return x + _dt.timedelta(days=y if op == "+" else -y)
            return None
        r = f(x, y)
        if op == "/" and r is not None:
            return float(r)
        return r
    return Column(g, f"({a._name} {op} {b._name})", [a, b])


def _cmp(a, b, f, op):
    b = _lit_if(b)

    def g(ctx):
        x, y = a._ev(ctx), b._ev(ctx)
        if x is None or y is None:
            return None
        x, y = _coerce_pair(x, y)
        try:
            return f(x, y)
        except TypeError:
            return f(str(x), str(y))
    return Column(g, f"({a._name} {op} {b._name})", [a, b])


def _make_when(branches, default):
    def g(ctx):
        for cond, val in branches:
            if cond._ev(ctx) is True:
                return val._ev(ctx)
        return default._ev(ctx) if default is not None else None
    name = "CASE " + " ".join(f"WHEN {c._name} THEN {v._name}" for c, v in branches) + (f" ELSE {default._name}" if default is not None else "") + " END"
    c = Column(g, name, [x for br in branches for x in br] + ([default] if default is not None else []))
    c._branches = branches
    return c


def _resolve(row, name):
    if name in row:
        return row[name]
    if "." in name:
        short = name.split(".", 1)[1]
        if short in row:
            return row[short]
    lower = {k.lower(): k for k in row}
    if name.lower() in lower:
        return row[lower[name.lower()]]
    raise AnalysisException(f"[UNRESOLVED_COLUMN.WITH_SUGGESTION] A column or function parameter with name `{name}` cannot be resolved. "
                            f"Did you mean one of the following? [{', '.join('`' + k + '`' for k in row if not k.startswith('__') and '.' not in k)}].")


def col(name):
    if isinstance(name, Column):
        return name
    if name == "*":
        c = Column(lambda ctx: None, "*")
        c._star = True
        return c
    c = Column(lambda ctx, n=name: _resolve(ctx.row, n), name.split(".")[-1] if "." in name else name)
    c._srcname = name
    return c


column = col


def lit(v):
    if isinstance(v, Column):
        return v
    return Column(lambda ctx: v, _fmt(v) if not isinstance(v, str) else v, kind="lit")


def expr(s):
    s = s.strip()
    m = _re.match(r"^([A-Za-z_][\w.]*)$", s)
    if m:
        return col(s)
    m = _re.match(r"^(.+?)\s+as\s+(\w+)$", s, _re.I)
    if m:
        return expr(m.group(1)).alias(m.group(2))
    c = Column(None, s)
    c._sql = s
    c._fn = lambda ctx, s=s: _eval_sql_expr(s, ctx.row)
    return c


def _eval_sql_expr(s, row):
    py = s
    py = _re.sub(r"(?i)\bAND\b", " and ", py)
    py = _re.sub(r"(?i)\bOR\b", " or ", py)
    py = _re.sub(r"(?i)\bNOT\b", " not ", py)
    py = _re.sub(r"(?<![<>!=])=(?!=)", "==", py)
    py = py.replace("<>", "!=")
    env = {k: v for k, v in row.items() if _re.match(r"^\w+$", k)}
    try:
        return eval(py, {"__builtins__": {}}, env)
    except TypeError:
        return None
    except Exception as e:
        raise AnalysisException(f"Could not evaluate SQL expression '{s}' in this in-browser Spark. Use Column functions (F.col(...)) or spark.sql(...). Detail: {e}")


# ----------------------------------------------------------------- aggregate functions

def _agg(name, colarg, fn, distinct=False):
    c0 = col(colarg) if isinstance(colarg, str) else colarg

    def g(ctx):
        if ctx.group is None:
            raise AnalysisException(f"[MISSING_GROUP_BY] The query does not include a GROUP BY clause. Aggregate '{name}' needs groupBy()/agg() or a window (over).")
        vals = [c0._ev(_Ctx(r)) for r in ctx.group]
        if distinct:
            seen, out = set(), []
            for v in vals:
                h = _hashable(v)
                if v is not None and h not in seen:
                    seen.add(h)
                    out.append(v)
            vals = out
        return fn(vals)
    inner = "DISTINCT " + c0._name if distinct else c0._name
    c = Column(g, f"{name}({inner})", [c0])
    c._is_agg = True
    c._aggfn = fn
    c._aggcol = c0
    c._distinct = distinct
    return c


def _nn(vals):
    return [v for v in vals if v is not None]


def _sum(vals):
    v = _nn(vals)
    return _py_sum(v) if v else None


def _avg(vals):
    v = _nn(vals)
    return float(_py_sum(v)) / len(v) if v else None


def sum(c):  # noqa: A001
    return _agg("sum", c, _sum)


def sum_distinct(c):
    return _agg("sum", c, _sum, distinct=True)


sumDistinct = sum_distinct


def avg(c):
    return _agg("avg", c, _avg)


mean = avg


def count(c):
    if isinstance(c, str) and c == "*" or (isinstance(c, Column) and getattr(c, "_star", False)):
        c2 = Column(lambda ctx: None, "count(1)")

        def g(ctx):
            if ctx.group is None:
                raise AnalysisException("count(*) needs groupBy()/agg() or a window")
            return len(ctx.group)
        c2._fn = g
        c2._is_agg = True
        c2._aggfn = len
        c2._aggcol = lit(1)
        c2._distinct = False
        c2._countstar = True
        return c2
    return _agg("count", c, lambda v: len(_nn(v)))


def countDistinct(c, *more):
    if more:
        cols = [col(x) if isinstance(x, str) else x for x in (c,) + more]
        packed = Column(lambda ctx: tuple(x._ev(ctx) for x in cols) if all(x._ev(ctx) is not None for x in cols) else None,
                        ", ".join(x._name for x in cols), cols)
        r = _agg("count", packed, lambda v: len(_nn(v)), distinct=True)
        return r
    return _agg("count", c, lambda v: len(_nn(v)), distinct=True)


count_distinct = countDistinct


def approx_count_distinct(c, rsd=0.05):
    r = _agg("approx_count_distinct", c, lambda v: len(set(_hashable(x) for x in _nn(v))))
    return r


def min(c):  # noqa: A001
    return _agg("min", c, lambda v: _py_min(_nn(v), key=_sort_key) if _nn(v) else None)


def max(c):  # noqa: A001
    return _agg("max", c, lambda v: _py_max(_nn(v), key=_sort_key) if _nn(v) else None)


def first(c, ignorenulls=False):
    return _agg("first", c, lambda v: (_nn(v)[0] if _nn(v) else None) if ignorenulls else (v[0] if v else None))


def last(c, ignorenulls=False):
    return _agg("last", c, lambda v: (_nn(v)[-1] if _nn(v) else None) if ignorenulls else (v[-1] if v else None))


def collect_list(c):
    return _agg("collect_list", c, lambda v: _nn(v))


def collect_set(c):
    def f(v):
        seen, out = set(), []
        for x in _nn(v):
            if _hashable(x) not in seen:
                seen.add(_hashable(x))
                out.append(x)
        return out
    return _agg("collect_set", c, f)


def _var(v, sample=True):
    v = [float(x) for x in _nn(v)]
    n = len(v)
    if n < (2 if sample else 1):
        return None
    m = _py_sum(v) / n
    return _py_sum((x - m) ** 2 for x in v) / (n - 1 if sample else n)


def stddev(c):
    return _agg("stddev", c, lambda v: None if _var(v) is None else _math.sqrt(_var(v)))


stddev_samp = stddev


def stddev_pop(c):
    return _agg("stddev_pop", c, lambda v: None if _var(v, False) is None else _math.sqrt(_var(v, False)))


def variance(c):
    return _agg("variance", c, _var)


var_samp = variance


def percentile_approx(c, p, accuracy=10000):
    def f(v):
        v = sorted(_nn(v), key=_sort_key)
        if not v:
            return None
        if isinstance(p, (list, tuple)):
            return [v[_py_min(len(v) - 1, _py_max(0, _math.ceil(q * len(v)) - 1))] for q in p]
        return v[_py_min(len(v) - 1, _py_max(0, _math.ceil(p * len(v)) - 1))]
    return _agg("percentile_approx", c, f)


def median(c):
    def f(v):
        v = sorted(float(x) for x in _nn(v))
        if not v:
            return None
        n = len(v)
        return v[n // 2] if n % 2 else (v[n // 2 - 1] + v[n // 2]) / 2
    return _agg("median", c, f)


# ----------------------------------------------------------------- window functions

def _winfn(name, kind, **kw):
    c = Column(lambda ctx: (_ for _ in ()).throw(AnalysisException(f"{name}() requires an OVER clause: use .over(Window.partitionBy(...).orderBy(...))")), f"{name}()")
    c._winfn = kind
    c._winkw = kw
    return c


def row_number():
    return _winfn("row_number", "row_number")


def rank():
    return _winfn("rank", "rank")


def dense_rank():
    return _winfn("dense_rank", "dense_rank")


def percent_rank():
    return _winfn("percent_rank", "percent_rank")


def cume_dist():
    return _winfn("cume_dist", "cume_dist")


def ntile(n):
    c = _winfn("ntile", "ntile", n=n)
    c._name = f"ntile({n})"
    return c


def lag(c, offset=1, default=None):
    c0 = col(c) if isinstance(c, str) else c
    w = _winfn("lag", "lag", col=c0, offset=offset, default=default)
    w._name = f"lag({c0._name}, {offset}, {_fmt(default)})"
    return w


def lead(c, offset=1, default=None):
    c0 = col(c) if isinstance(c, str) else c
    w = _winfn("lead", "lead", col=c0, offset=offset, default=default)
    w._name = f"lead({c0._name}, {offset}, {_fmt(default)})"
    return w


def nth_value(c, n, ignoreNulls=False):
    c0 = col(c) if isinstance(c, str) else c
    return _winfn("nth_value", "nth_value", col=c0, n=n)


class WindowSpec:
    def __init__(self, part=None, order=None, frame=None):
        self._part = part or []
        self._order = order or []
        self._frame = frame  # ("rows"|"range", start, end) or None

    def partitionBy(self, *cols):
        cols = _flat(cols)
        return WindowSpec([col(c) if isinstance(c, str) else c for c in cols], self._order, self._frame)

    def orderBy(self, *cols):
        cols = _flat(cols)
        return WindowSpec(self._part, [col(c) if isinstance(c, str) else c for c in cols], self._frame)

    def rowsBetween(self, start, end):
        return WindowSpec(self._part, self._order, ("rows", start, end))

    def rangeBetween(self, start, end):
        return WindowSpec(self._part, self._order, ("range", start, end))

    def _desc(self):
        p = ("PARTITION BY " + ", ".join(c._name for c in self._part)) if self._part else ""
        o = ("ORDER BY " + ", ".join(c._name + (" DESC" if c._sort and not c._sort[0] else " ASC") for c in self._order)) if self._order else ""
        f = ""
        if self._frame:
            f = f"{self._frame[0].upper()}BETWEEN {self._frame[1]} AND {self._frame[2]}"
        return " ".join(x for x in (p, o, f) if x)


class Window:
    unboundedPreceding = -(2 ** 63)
    unboundedFollowing = 2 ** 63 - 1
    currentRow = 0

    @staticmethod
    def partitionBy(*cols):
        return WindowSpec().partitionBy(*cols)

    @staticmethod
    def orderBy(*cols):
        return WindowSpec().orderBy(*cols)

    @staticmethod
    def rowsBetween(s, e):
        return WindowSpec().rowsBetween(s, e)


def _order_rows(rows, order):
    """Stable multi-key sort honouring asc/desc and Spark's null ordering."""
    out = list(rows)
    for c in reversed(order):
        asc, nulls_first = c._sort if c._sort else (True, True)
        vals = [(c._ev(_Ctx(r)), i) for i, r in enumerate(out)]
        nulls = [out[i] for v, i in vals if v is None]
        non = [(v, out[i]) for v, i in vals if v is not None]
        non.sort(key=lambda t: _sort_key(t[0]), reverse=not asc)
        non_rows = [r for _, r in non]
        out = nulls + non_rows if nulls_first else non_rows + nulls
    return out


def _compute_window(rows, wcol):
    spec, inner = wcol._win, wcol._inner
    groups = {}
    for r in rows:
        k = tuple(_hashable(p._ev(_Ctx(r))) for p in spec._part)
        groups.setdefault(k, []).append(r)
    for part in groups.values():
        ordered = _order_rows(part, spec._order) if spec._order else list(part)
        okeys = [tuple(_hashable(c._ev(_Ctx(r))) for c in spec._order) for r in ordered]
        n = len(ordered)
        kind = getattr(inner, "_winfn", None)
        if kind in ("row_number", "rank", "dense_rank", "percent_rank", "cume_dist", "ntile"):
            if not spec._order:
                raise AnalysisException(f"Window function {kind}() requires window to be ordered, please add ORDER BY clause.")
            rank_v, dense_v = 0, 0
            for i, r in enumerate(ordered):
                if i == 0 or okeys[i] != okeys[i - 1]:
                    rank_v = i + 1
                    dense_v += 1
                if kind == "row_number":
                    r[wcol._key] = i + 1
                elif kind == "rank":
                    r[wcol._key] = rank_v
                elif kind == "dense_rank":
                    r[wcol._key] = dense_v
                elif kind == "percent_rank":
                    r[wcol._key] = 0.0 if n == 1 else (rank_v - 1) / (n - 1)
                elif kind == "cume_dist":
                    last_peer = _py_max(j for j in range(n) if okeys[j] == okeys[i])
                    r[wcol._key] = (last_peer + 1) / n
                elif kind == "ntile":
                    k = inner._winkw["n"]
                    base, extra = divmod(n, k)
                    # first `extra` buckets get base+1 rows
                    idx, b = i, 0
                    while True:
                        size = base + (1 if b < extra else 0)
                        if idx < size:
                            break
                        idx -= size
                        b += 1
                    r[wcol._key] = b + 1
        elif kind in ("lag", "lead"):
            off = inner._winkw["offset"] * (1 if kind == "lead" else -1)
            for i, r in enumerate(ordered):
                j = i + off
                r[wcol._key] = inner._winkw["col"]._ev(_Ctx(ordered[j])) if 0 <= j < n else inner._winkw["default"]
        elif kind == "nth_value":
            for i, r in enumerate(ordered):
                k = inner._winkw["n"] - 1
                r[wcol._key] = inner._winkw["col"]._ev(_Ctx(ordered[k])) if k <= i else None
        elif inner._is_agg or inner._contains_agg():
            fr = spec._frame
            for i, r in enumerate(ordered):
                if fr and fr[0] == "rows":
                    lo = 0 if fr[1] <= Window.unboundedPreceding else _py_max(0, i + fr[1])
                    hi = n - 1 if fr[2] >= Window.unboundedFollowing else _py_min(n - 1, i + fr[2])
                    frame = ordered[lo:hi + 1] if lo <= hi else []
                elif spec._order and not fr:
                    # Spark default with ORDER BY: RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW (peers included)
                    hi = i
                    while hi + 1 < n and okeys[hi + 1] == okeys[i]:
                        hi += 1
                    frame = ordered[:hi + 1]
                else:
                    frame = ordered
                r[wcol._key] = inner._ev(_Ctx(r, frame))
        else:
            raise AnalysisException(f"Unsupported window expression {inner._name}")


# ----------------------------------------------------------------- scalar functions

def _c(x):
    return col(x) if isinstance(x, str) else x


def _f1(name, fn):
    def maker(c, *a):
        cc = _c(c)
        return _un(cc, lambda v: fn(v, *a), f"{name}({cc._name})")
    maker.__name__ = name
    return maker


upper = _f1("upper", lambda v: str(v).upper())
lower = _f1("lower", lambda v: str(v).lower())
trim = _f1("trim", lambda v: str(v).strip())
ltrim = _f1("ltrim", lambda v: str(v).lstrip())
rtrim = _f1("rtrim", lambda v: str(v).rstrip())
length = _f1("length", lambda v: len(str(v)))
initcap = _f1("initcap", lambda v: " ".join(w[:1].upper() + w[1:].lower() for w in str(v).split(" ")))
reverse = _f1("reverse", lambda v: v[::-1])
abs = _f1("abs", lambda v: _py_abs(v))  # noqa: A001
sqrt = _f1("sqrt", lambda v: _math.sqrt(v) if v >= 0 else None)
exp = _f1("exp", lambda v: _math.exp(v))
log10 = _f1("log10", lambda v: _math.log10(v) if v > 0 else None)
ceil = _f1("ceil", lambda v: int(_math.ceil(v)))
floor = _f1("floor", lambda v: int(_math.floor(v)))
md5 = _f1("md5", lambda v: _hl.md5(str(v).encode()).hexdigest())
size = _f1("size", lambda v: len(v))
year = _f1("year", lambda v: _to_date(v).year if _to_date(v) else None)
month = _f1("month", lambda v: _to_date(v).month if _to_date(v) else None)
dayofmonth = _f1("dayofmonth", lambda v: _to_date(v).day if _to_date(v) else None)
dayofweek = _f1("dayofweek", lambda v: (_to_date(v).isoweekday() % 7) + 1 if _to_date(v) else None)
dayofyear = _f1("dayofyear", lambda v: _to_date(v).timetuple().tm_yday if _to_date(v) else None)
weekofyear = _f1("weekofyear", lambda v: _to_date(v).isocalendar()[1] if _to_date(v) else None)
quarter = _f1("quarter", lambda v: (_to_date(v).month - 1) // 3 + 1 if _to_date(v) else None)
hour = _f1("hour", lambda v: _to_ts(v).hour if _to_ts(v) else None)
minute = _f1("minute", lambda v: _to_ts(v).minute if _to_ts(v) else None)
last_day = _f1("last_day", lambda v: (_dt.date(_to_date(v).year + (_to_date(v).month == 12), _to_date(v).month % 12 + 1, 1) - _dt.timedelta(days=1)) if _to_date(v) else None)


def log(arg1, arg2=None):
    if arg2 is None:
        return _un(_c(arg1), lambda v: _math.log(v) if v > 0 else None, f"ln({_c(arg1)._name})")
    return _un(_c(arg2), lambda v: _math.log(v, arg1) if v > 0 else None, f"log({arg1}, {_c(arg2)._name})")


def pow(a, b):  # noqa: A001
    return _arith(_c(a), b if isinstance(b, Column) else lit(b), lambda x, y: float(x) ** float(y), "^")


power = pow


def sha2(c, bits=256):
    return _un(_c(c), lambda v: getattr(_hl, f"sha{bits}")(str(v).encode()).hexdigest(), f"sha2({_c(c)._name}, {bits})")


def round(c, scale=0):  # noqa: A001
    cc = _c(c)

    def f(v):
        # Spark rounds HALF_UP, Python rounds half-to-even
        q = 10 ** scale
        r = _math.floor(_py_abs(v) * q + 0.5 + 1e-9) / q
        r = r if v >= 0 else -r
        return r if scale > 0 or isinstance(v, float) else int(r)
    return _un(cc, f, f"round({cc._name}, {scale})")


def bround(c, scale=0):
    cc = _c(c)
    return _un(cc, lambda v: _py_round(v, scale), f"bround({cc._name}, {scale})")


def concat(*cols):
    cs = [_c(x) for x in cols]

    def g(ctx):
        vals = [x._ev(ctx) for x in cs]
        if any(v is None for v in vals):
            return None
        if all(isinstance(v, list) for v in vals):
            return [y for v in vals for y in v]
        return "".join(_fmt(v) if not isinstance(v, str) else v for v in vals)
    return Column(g, f"concat({', '.join(x._name for x in cs)})", cs)


def concat_ws(sep, *cols):
    cs = [_c(x) for x in cols]

    def g(ctx):
        parts = []
        for x in cs:
            v = x._ev(ctx)
            if v is None:
                continue
            if isinstance(v, list):
                parts.extend(_fmt(y) if not isinstance(y, str) else y for y in v if y is not None)
            else:
                parts.append(v if isinstance(v, str) else _fmt(v))
        return sep.join(parts)
    return Column(g, f"concat_ws({sep}, {', '.join(x._name for x in cs)})", cs)


def substring(c, pos, length):
    cc = _c(c)

    def f(v):
        s = str(v)
        start = pos - 1 if pos > 0 else (len(s) + pos if pos < 0 else 0)
        return s[start:start + length]
    return _un(cc, f, f"substring({cc._name}, {pos}, {length})")


def split(c, pattern, limit=-1):
    cc = _c(c)
    return _un(cc, lambda v: _re.split(pattern, str(v), maxsplit=0 if limit <= 0 else limit - 1), f"split({cc._name}, {pattern}, {limit})")


def regexp_replace(c, pattern, replacement):
    cc = _c(c)
    rep = _re.sub(r"\$(\d)", r"\\\1", replacement)
    return _un(cc, lambda v: _re.sub(pattern, rep, str(v)), f"regexp_replace({cc._name}, {pattern}, {replacement}, 1)")


def regexp_extract(c, pattern, idx):
    cc = _c(c)

    def f(v):
        m = _re.search(pattern, str(v))
        return m.group(idx) if m else ""
    return _un(cc, f, f"regexp_extract({cc._name}, {pattern}, {idx})")


def lpad(c, n, pad):
    cc = _c(c)
    return _un(cc, lambda v: (pad * n + str(v))[-n:] if len(str(v)) < n else str(v)[:n], f"lpad({cc._name}, {n}, {pad})")


def rpad(c, n, pad):
    cc = _c(c)
    return _un(cc, lambda v: (str(v) + pad * n)[:n], f"rpad({cc._name}, {n}, {pad})")


def instr(c, sub):
    cc = _c(c)
    return _un(cc, lambda v: str(v).find(sub) + 1, f"instr({cc._name}, {sub})")


def translate(c, matching, replace):
    cc = _c(c)
    table = {ord(a): (replace[i] if i < len(replace) else None) for i, a in enumerate(matching)}
    return _un(cc, lambda v: str(v).translate(table), f"translate({cc._name}, {matching}, {replace})")


def coalesce(*cols):
    cs = [_c(x) for x in cols]

    def g(ctx):
        for x in cs:
            v = x._ev(ctx)
            if v is not None:
                return v
        return None
    return Column(g, f"coalesce({', '.join(x._name for x in cs)})", cs)


def nvl(a, b):
    return coalesce(a, b)


ifnull = nvl


def nullif(a, b):
    a, b = _c(a), _lit_if(b)
    return Column(lambda ctx: None if a._ev(ctx) == b._ev(ctx) else a._ev(ctx), f"nullif({a._name}, {b._name})", [a, b])


def isnull(c):
    return _c(c).isNull()


def isnan(c):
    cc = _c(c)
    return Column(lambda ctx: isinstance(cc._ev(ctx), float) and _math.isnan(cc._ev(ctx)), f"isnan({cc._name})", [cc])


def greatest(*cols):
    cs = [_c(x) for x in cols]
    return Column(lambda ctx: (_py_max(_nn([x._ev(ctx) for x in cs]), key=_sort_key) if _nn([x._ev(ctx) for x in cs]) else None),
                  f"greatest({', '.join(x._name for x in cs)})", cs)


def least(*cols):
    cs = [_c(x) for x in cols]
    return Column(lambda ctx: (_py_min(_nn([x._ev(ctx) for x in cs]), key=_sort_key) if _nn([x._ev(ctx) for x in cs]) else None),
                  f"least({', '.join(x._name for x in cs)})", cs)


def when(cond, value):
    return _make_when([(cond, _lit_if(value))], None)


def to_date(c, fmt=None):
    cc = _c(c)

    def f(v):
        if fmt and isinstance(v, str):
            try:
                return _dt.datetime.strptime(v, _java_fmt(fmt)).date()
            except ValueError:
                return None
        return _to_date(v)
    return _un(cc, f, f"to_date({cc._name})")


def to_timestamp(c, fmt=None):
    cc = _c(c)

    def f(v):
        if fmt and isinstance(v, str):
            try:
                return _dt.datetime.strptime(v, _java_fmt(fmt))
            except ValueError:
                return None
        return _to_ts(v)
    return _un(cc, f, f"to_timestamp({cc._name})")


def _java_fmt(f):
    rep = [("yyyy", "%Y"), ("yy", "%y"), ("MMMM", "%B"), ("MMM", "%b"), ("MM", "%m"), ("dd", "%d"), ("HH", "%H"),
           ("hh", "%I"), ("mm", "%M"), ("ss", "%S"), ("EEEE", "%A"), ("EEE", "%a"), ("a", "%p")]
    out, i = "", 0
    while i < len(f):
        for j, p in rep:
            if f.startswith(j, i):
                out += p
                i += len(j)
                break
        else:
            out += f[i]
            i += 1
    return out


def date_format(c, fmt):
    cc = _c(c)
    return _un(cc, lambda v: (_to_ts(v) or _dt.datetime.min).strftime(_java_fmt(fmt)) if _to_ts(v) else None, f"date_format({cc._name}, {fmt})")


def datediff(end, start):
    e, s = _c(end), _c(start)
    return Column(lambda ctx: ((_to_date(e._ev(ctx)) - _to_date(s._ev(ctx))).days if _to_date(e._ev(ctx)) and _to_date(s._ev(ctx)) else None),
                  f"datediff({e._name}, {s._name})", [e, s])


def months_between(end, start, roundOff=True):
    e, s = _c(end), _c(start)

    def g(ctx):
        a, b = _to_date(e._ev(ctx)), _to_date(s._ev(ctx))
        if not a or not b:
            return None
        return _py_round((a.year - b.year) * 12 + (a.month - b.month) + (a.day - b.day) / 31.0, 8)
    return Column(g, f"months_between({e._name}, {s._name}, true)", [e, s])


def date_add(c, days):
    cc = _c(c)
    return _un(cc, lambda v: _to_date(v) + _dt.timedelta(days=days) if _to_date(v) else None, f"date_add({cc._name}, {days})")


def date_sub(c, days):
    cc = _c(c)
    return _un(cc, lambda v: _to_date(v) - _dt.timedelta(days=days) if _to_date(v) else None, f"date_sub({cc._name}, {days})")


def add_months(c, n):
    cc = _c(c)

    def f(v):
        d = _to_date(v)
        if not d:
            return None
        m = d.month - 1 + n
        y, m = d.year + m // 12, m % 12 + 1
        import calendar
        return _dt.date(y, m, _py_min(d.day, calendar.monthrange(y, m)[1]))
    return _un(cc, f, f"add_months({cc._name}, {n})")


def date_trunc(fmt, c):
    cc = _c(c)
    unit = fmt.lower()

    def f(v):
        t = _to_ts(v)
        if not t:
            return None
        if unit in ("year", "yyyy", "yy"):
            return _dt.datetime(t.year, 1, 1)
        if unit in ("quarter",):
            return _dt.datetime(t.year, (t.month - 1) // 3 * 3 + 1, 1)
        if unit in ("month", "mon", "mm"):
            return _dt.datetime(t.year, t.month, 1)
        if unit == "week":
            d0 = t.date() - _dt.timedelta(days=t.weekday())
            return _dt.datetime(d0.year, d0.month, d0.day)
        if unit in ("day", "dd"):
            return _dt.datetime(t.year, t.month, t.day)
        if unit == "hour":
            return t.replace(minute=0, second=0, microsecond=0)
        if unit == "minute":
            return t.replace(second=0, microsecond=0)
        return t
    return _un(cc, f, f"date_trunc({fmt}, {cc._name})")


def trunc(c, fmt):
    cc = _c(c)
    return _un(cc, lambda v: (date_trunc(fmt, lit(v))._ev(_Ctx({})) or None) and date_trunc(fmt, lit(v))._ev(_Ctx({})).date(), f"trunc({cc._name}, {fmt})")


def current_date():
    return Column(lambda ctx: _dt.date(2026, 11, 25), "current_date()")


def current_timestamp():
    return Column(lambda ctx: _dt.datetime(2026, 11, 25, 9, 0, 0), "current_timestamp()")


def unix_timestamp(c=None, fmt=None):
    if c is None:
        return Column(lambda ctx: int(_dt.datetime(2026, 11, 25, 9, 0).timestamp()), "unix_timestamp()")
    cc = _c(c)
    return _un(cc, lambda v: int(_to_ts(v).replace(tzinfo=_dt.timezone.utc).timestamp()) if _to_ts(v) else None, f"unix_timestamp({cc._name})")


def window(timeColumn, windowDuration, slideDuration=None):
    """Tumbling time window -> struct {start, end} (as a dict)."""
    cc = _c(timeColumn)
    secs = _dur(windowDuration)

    def f(v):
        t = _to_ts(v)
        if not t:
            return None
        epoch = int(t.replace(tzinfo=_dt.timezone.utc).timestamp())
        start = epoch - epoch % secs
        s = _dt.datetime.fromtimestamp(start, _dt.timezone.utc).replace(tzinfo=None)
        return {"start": s, "end": s + _dt.timedelta(seconds=secs)}
    c = _un(cc, f, "window")
    return c


def _dur(s):
    m = _re.match(r"(\d+)\s*(second|minute|hour|day)s?", s.strip(), _re.I)
    if not m:
        raise AnalysisException(f"Unsupported duration '{s}'")
    return int(m.group(1)) * {"second": 1, "minute": 60, "hour": 3600, "day": 86400}[m.group(2).lower()]


def array(*cols):
    cs = [_c(x) for x in _flat(cols)]
    return Column(lambda ctx: [x._ev(ctx) for x in cs], f"array({', '.join(x._name for x in cs)})", cs)


def array_contains(c, v):
    cc = _c(c)
    return _un(cc, lambda a: v in a, f"array_contains({cc._name}, {_fmt(v)})")


def array_distinct(c):
    cc = _c(c)
    return _un(cc, lambda a: list(dict.fromkeys(a)), f"array_distinct({cc._name})")


def sort_array(c, asc=True):
    cc = _c(c)
    return _un(cc, lambda a: sorted(a, key=_sort_key, reverse=not asc), f"sort_array({cc._name}, {str(asc).lower()})")


def struct(*cols):
    cs = [_c(x) for x in _flat(cols)]
    return Column(lambda ctx: {x._name: x._ev(ctx) for x in cs}, f"struct({', '.join(x._name for x in cs)})", cs)


def explode(c):
    cc = _c(c)
    e = Column(lambda ctx: cc._ev(ctx), "col", [cc])
    e._explode = "explode"
    return e


def explode_outer(c):
    e = explode(c)
    e._explode = "explode_outer"
    return e


def posexplode(c):
    e = explode(c)
    e._explode = "posexplode"
    return e


def monotonically_increasing_id():
    c = Column(lambda ctx: ctx.row.get("__rowidx__"), "monotonically_increasing_id()")
    return c


def spark_partition_id():
    return Column(lambda ctx: 0, "SPARK_PARTITION_ID()")


def input_file_name():
    return Column(lambda ctx: "", "input_file_name()")


def broadcast(df):
    df2 = df._derive(df._rows, df._cols, ("BroadcastHint", ""))
    df2._broadcast = True
    return df2


def udf(f=None, returnType=StringType()):
    if f is None or isinstance(f, (DataType, str)) or (isinstance(f, type) and issubclass(f, DataType)):
        rt = f if f is not None else returnType
        return lambda fn: udf(fn, rt)

    def maker(*cols):
        cs = [_c(x) for x in cols]

        def g(ctx):
            return _cast(f(*[x._ev(ctx) for x in cs]), returnType) if returnType is not None else f(*[x._ev(ctx) for x in cs])
        return Column(g, f"{f.__name__}({', '.join(x._name for x in cs)})", cs)
    maker.__name__ = f.__name__
    maker.func = f
    return maker


pandas_udf = udf


def asc(c):
    return _c(c).asc()


def desc(c):
    return _c(c).desc()


def asc_nulls_last(c):
    return _c(c).asc_nulls_last()


def desc_nulls_first(c):
    return _c(c).desc_nulls_first()


def _flat(cols):
    out = []
    for c in cols:
        if isinstance(c, (list, tuple)):
            out.extend(c)
        else:
            out.append(c)
    return out


# ----------------------------------------------------------------- DataFrame

class _Plan:
    def __init__(self, op, detail, children):
        self.op, self.detail, self.children = op, detail, children


class DataFrame:
    def __init__(self, rows, cols, session, plan=None):
        self._rows = rows            # list[dict]
        self._cols = list(cols)      # visible column names in order
        self._session = session
        self._plan = plan or _Plan("Scan", "LocalRelation", [])
        self._alias = None
        self._broadcast = False
        self._nparts = 1
        self._cached = False

    # ---- internals
    def _derive(self, rows, cols, op, children=None):
        df = DataFrame(rows, cols, self._session, _Plan(op[0], op[1], children if children is not None else [self._plan]))
        df._nparts = self._nparts
        return df

    def _ctxrows(self):
        out = []
        for i, r in enumerate(self._rows):
            d = dict(r)
            if self._alias:
                for c in self._cols:
                    d[f"{self._alias}.{c}"] = r.get(c)
            d["__rowidx__"] = i
            out.append(d)
        return out

    def _expand(self, cols):
        out = []
        for c in _flat(cols):
            if isinstance(c, str):
                if c == "*":
                    out.extend(col(x) for x in self._cols)
                elif c.endswith(".*"):
                    out.extend(col(x) for x in self._cols)
                else:
                    out.append(col(c))
            elif getattr(c, "_star", False):
                out.extend(col(x) for x in self._cols)
            else:
                out.append(c)
        return out

    def _check_cols(self, cols):
        sample = dict.fromkeys(self._cols)
        if self._rows:
            sample = dict(self._ctxrows()[0])
        else:
            if self._alias:
                for c in self._cols:
                    sample[f"{self._alias}.{c}"] = None
        for c in cols:
            if getattr(c, "_srcname", None) and not getattr(c, "_is_window", False):
                _resolve(sample, c._srcname)

    # ---- column access
    def __getattr__(self, item):
        if item.startswith("_"):
            raise AttributeError(item)
        if item in self.__dict__.get("_cols", []):
            return self[item]
        raise AttributeError(f"'DataFrame' object has no attribute '{item}'")

    def __getitem__(self, item):
        if isinstance(item, str):
            if item not in self._cols:
                _resolve(dict.fromkeys(self._cols), item)
            q = f"{self._alias}.{item}" if self._alias else item
            c = Column(lambda ctx, a=q, b=item, me=id(self): ctx.row[f"__df{me}.{b}"] if f"__df{me}.{b}" in ctx.row else (ctx.row[a] if a in ctx.row else _resolve(ctx.row, b)), item)
            c._srcname = item
            return c
        if isinstance(item, Column):
            return self.filter(item)
        if isinstance(item, (list, tuple)):
            return self.select(*item)
        if isinstance(item, int):
            return col(self._cols[item])
        raise TypeError(item)

    @property
    def columns(self):
        return list(self._cols)

    @property
    def dtypes(self):
        return [(c, _type_of([r.get(c) for r in self._rows])) for c in self._cols]

    @property
    def schema(self):
        return StructType([StructField(c, _parse_type(t) if not t.startswith(("array", "map")) else StringType()) for c, t in self.dtypes])

    @property
    def rdd(self):
        me = self
        ns = _types.SimpleNamespace()
        ns.getNumPartitions = lambda: me._nparts
        ns.collect = lambda: me.collect()
        ns.map = lambda f: [f(r) for r in me.collect()]
        return ns

    @property
    def write(self):
        return _Writer(self)

    @property
    def na(self):
        me = self
        ns = _types.SimpleNamespace()
        ns.fill = lambda value, subset=None: me.fillna(value, subset)
        ns.drop = lambda how="any", thresh=None, subset=None: me.dropna(how, thresh, subset)
        ns.replace = lambda to_replace, value=None, subset=None: me.replace(to_replace, value, subset)
        return ns

    def alias(self, name):
        df = self._derive(self._rows, self._cols, ("SubqueryAlias", name))
        df._alias = name
        df._broadcast = self._broadcast
        return df

    # ---- transformations
    def select(self, *cols):
        exprs = self._expand(cols)
        self._check_cols(exprs)
        rows = self._ctxrows()
        has_agg = [e for e in exprs if e._contains_agg() and not e._windows()]
        if has_agg and len(has_agg) == len(exprs):
            return self.groupBy().agg(*exprs)
        if has_agg:
            bad = [e._name for e in exprs if not e._contains_agg()]
            raise AnalysisException(f"[MISSING_GROUP_BY] Column(s) {bad} are neither aggregated nor in a GROUP BY. Use groupBy(...).agg(...).")
        for e in exprs:
            for w in e._windows():
                _compute_window(rows, w)
        names = [e._name for e in exprs]
        explode_idx = [i for i, e in enumerate(exprs) if getattr(e, "_explode", None) or getattr(getattr(e, "_alias_of", None), "_explode", None)]
        out = []
        for r in rows:
            ctx = _Ctx(r)
            vals = [e._ev(ctx) for e in exprs]
            if explode_idx:
                i = explode_idx[0]
                e = exprs[i]
                mode = getattr(e, "_explode", None) or e._alias_of._explode
                arr = vals[i]
                items = list(arr.items()) if isinstance(arr, dict) else (arr or [])
                if not items:
                    if mode == "explode_outer":
                        vals[i] = None
                        out.append(dict(zip(names, vals)))
                    continue
                for pos, it in enumerate(items):
                    v2 = list(vals)
                    v2[i] = it
                    out.append(dict(zip(names, v2)))
            else:
                d = dict(zip(names, vals))
                # keep qualified (alias) refs alive for chained selects after self-joins
                out.append(d)
        return self._derive(out, names, ("Project", ", ".join(names)))

    def selectExpr(self, *exprs):
        return self.select(*[expr(e) for e in exprs])

    def withColumn(self, name, c):
        if not isinstance(c, Column):
            raise TypeError("withColumn() argument 'col' should be a Column. Wrap literals with F.lit(...).")
        self._check_cols([c])
        rows = self._ctxrows()
        if c._contains_agg() and not c._windows():
            raise AnalysisException(f"[MISSING_GROUP_BY] Aggregate '{c._name}' in withColumn needs a window: .over(Window.partitionBy(...)).")
        for w in c._windows():
            _compute_window(rows, w)
        out = []
        for r in rows:
            v = c._ev(_Ctx(r))
            d = {k: r[k] for k in self._cols}
            for k in r:
                if "." in k and not k.startswith("__"):
                    d[k] = r[k]
            d[name] = v
            out.append(d)
        cols = list(self._cols) if name in self._cols else self._cols + [name]
        df = self._derive(out, cols, ("Project", f"*, {c._name} AS {name}"))
        df._alias = None
        return df

    def withColumns(self, mapping):
        df = self
        for k, v in mapping.items():
            df = df.withColumn(k, v)
        return df

    def withColumnRenamed(self, old, new):
        if old not in self._cols:
            return self
        out = [{(new if k == old else k): v for k, v in r.items()} for r in self._rows]
        return self._derive(out, [new if c == old else c for c in self._cols], ("Project", f"{old} AS {new}"))

    def withColumnsRenamed(self, mapping):
        df = self
        for k, v in mapping.items():
            df = df.withColumnRenamed(k, v)
        return df

    def toDF(self, *names):
        out = [dict(zip(names, [r.get(c) for c in self._cols])) for r in self._rows]
        return self._derive(out, list(names), ("Project", ", ".join(names)))

    def drop(self, *cols):
        names = [c if isinstance(c, str) else c._name for c in cols]
        keep = [c for c in self._cols if c not in names]
        return self._derive([{k: r.get(k) for k in keep} for r in self._rows], keep, ("Project", ", ".join(keep)))

    def filter(self, condition):
        if isinstance(condition, str):
            return self._sql_filter(condition)
        self._check_cols([condition])
        rows = self._ctxrows()
        for w in condition._windows():
            _compute_window(rows, w)
        out = [{k: v for k, v in r.items() if k != "__rowidx__" and not k.startswith("__w")} for r in rows if condition._ev(_Ctx(r)) is True]
        df = self._derive(out, self._cols, ("Filter", condition._name))
        df._alias = self._alias
        return df

    where = filter

    def _sql_filter(self, cond):
        view = f"__filter_{id(self)}"
        self.createOrReplaceTempView(view)
        res = self._session.sql(f"SELECT * FROM {view} WHERE {cond}")
        self._session._views.pop(view, None)
        return self._derive(res._rows, res._cols, ("Filter", cond))

    def limit(self, n):
        return self._derive(self._rows[:n], self._cols, ("GlobalLimit", str(n)))

    def distinct(self):
        seen, out = set(), []
        for r in self._rows:
            k = tuple(_hashable(r.get(c)) for c in self._cols)
            if k not in seen:
                seen.add(k)
                out.append(r)
        return self._derive(out, self._cols, ("HashAggregate(distinct)", ", ".join(self._cols)))

    def dropDuplicates(self, subset=None):
        if subset is None:
            return self.distinct()
        if isinstance(subset, str):
            subset = [subset]
        for s in subset:
            _resolve(dict.fromkeys(self._cols), s)
        seen, out = set(), []
        for r in self._rows:
            k = tuple(_hashable(r.get(c)) for c in subset)
            if k not in seen:
                seen.add(k)
                out.append(r)
        return self._derive(out, self._cols, ("HashAggregate(dropDuplicates)", ", ".join(subset)))

    drop_duplicates = dropDuplicates

    def orderBy(self, *cols, ascending=None):
        cs = [col(c) if isinstance(c, str) else c for c in _flat(cols)]
        if ascending is not None:
            flags = ascending if isinstance(ascending, (list, tuple)) else [ascending] * len(cs)
            cs = [c.asc() if a else c.desc() for c, a in zip(cs, flags)]
        self._check_cols(cs)
        rows = _order_rows(self._ctxrows(), cs)
        out = [{k: v for k, v in r.items() if k != "__rowidx__"} for r in rows]
        df = self._derive(out, self._cols, ("Sort", ", ".join(c._name + (" DESC" if c._sort and not c._sort[0] else " ASC") for c in cs)))
        df._alias = self._alias
        return df

    sort = orderBy

    def sortWithinPartitions(self, *cols, **kw):
        return self.orderBy(*cols, **kw)

    def groupBy(self, *cols):
        return GroupedData(self, [col(c) if isinstance(c, str) else c for c in _flat(cols)])

    groupby = groupBy

    def agg(self, *exprs):
        return self.groupBy().agg(*exprs)

    def join(self, other, on=None, how="inner"):
        how = (how or "inner").lower().replace("_", "")
        alias_map = {"inner": "inner", "left": "left", "leftouter": "left", "right": "right", "rightouter": "right", "outer": "full",
                     "full": "full", "fullouter": "full", "leftsemi": "semi", "semi": "semi", "leftanti": "anti", "anti": "anti", "cross": "cross"}
        if how not in alias_map:
            raise AnalysisException(f"Unsupported join type '{how}'. Supported: inner, left, right, full, left_semi, left_anti, cross.")
        how = alias_map[how]
        L = self._ctxrows()
        Rr = other._ctxrows()
        for r in L:
            for c in self._cols:
                r[f"__df{id(self)}.{c}"] = r.get(c)
        for r in Rr:
            for c in other._cols:
                r[f"__df{id(other)}.{c}"] = r.get(c)
        using = None
        cond = None
        if on is None:
            if how != "cross":
                how = "cross"
        elif isinstance(on, str):
            using = [on]
        elif isinstance(on, (list, tuple)) and all(isinstance(x, str) for x in on):
            using = list(on)
        elif isinstance(on, (list, tuple)):
            cond = on[0]
            for x in on[1:]:
                cond = cond & x
        else:
            cond = on
        if using:
            for u in using:
                if u not in self._cols or u not in other._cols:
                    raise AnalysisException(f"[UNRESOLVED_USING_COLUMN_FOR_JOIN] USING column `{u}` cannot be resolved on both sides of the join.")
        right_cols = [c for c in other._cols if not (using and c in using)]
        left_only = [c for c in self._cols]
        dup = set(left_only) & set(right_cols)

        def merged(l, r):
            d = {}
            if l is not None:
                d.update(l)
            else:
                for c in self._cols:
                    d[c] = None
                    if self._alias:
                        d[f"{self._alias}.{c}"] = None
            if r is not None:
                for k, v in r.items():
                    if k == "__rowidx__":
                        continue
                    if k in d and k in self._cols and not k.startswith("__"):
                        # duplicate column name: keep left value under plain name, right reachable via alias/df ref
                        if using and k in using and d[k] is None:
                            d[k] = v
                        continue
                    d[k] = v
            else:
                for c in other._cols:
                    if c not in d:
                        d[c] = None
                    if other._alias:
                        d[f"{other._alias}.{c}"] = None
            return d

        def match(l, r):
            if using:
                for u in using:
                    a, b = l.get(u), r.get(u)
                    if a is None or b is None:
                        return False
                    a, b = _coerce_pair(a, b)
                    if a != b:
                        return False
                return True
            if cond is None:
                return True
            return cond._ev(_Ctx(merged(l, r))) is True

        out, matched_r = [], set()
        # simple hash join for equi USING joins; nested loop otherwise
        if using:
            idx = {}
            for j, r in enumerate(Rr):
                idx.setdefault(tuple(_hashable(_coerce_pair(r.get(u), 0)[0]) if False else _hashable(r.get(u)) for u in using), []).append(j)
        for l in L:
            hits = []
            if using:
                key = tuple(_hashable(l.get(u)) for u in using)
                cands = idx.get(key, []) if None not in key else []
                hits = [j for j in cands]
                if not hits and None not in key:
                    hits = [j for j, r in enumerate(Rr) if match(l, r)] if any(isinstance(l.get(u), str) for u in using) else []
            else:
                hits = [j for j, r in enumerate(Rr) if match(l, r)]
            if how == "semi":
                if hits:
                    out.append({k: v for k, v in l.items() if k != "__rowidx__"})
                continue
            if how == "anti":
                if not hits:
                    out.append({k: v for k, v in l.items() if k != "__rowidx__"})
                continue
            for j in hits:
                matched_r.add(j)
                out.append(merged(l, Rr[j]))
            if not hits and how in ("left", "full"):
                out.append(merged(l, None))
        if how in ("right", "full"):
            for j, r in enumerate(Rr):
                if j not in matched_r:
                    m = merged(None, r)
                    if using:
                        for u in using:
                            m[u] = r.get(u)
                    out.append(m)
        if how in ("semi", "anti"):
            cols = list(self._cols)
        else:
            cols = (list(using) if using else []) + [c for c in self._cols if not (using and c in using)] + [c for c in right_cols if c not in dup]
        jtype = {"inner": "Inner", "left": "LeftOuter", "right": "RightOuter", "full": "FullOuter", "semi": "LeftSemi", "anti": "LeftAnti", "cross": "Cross"}[how]
        strategy = "BroadcastHashJoin" if (other._broadcast or self._broadcast) else ("BroadcastNestedLoopJoin" if how == "cross" else "SortMergeJoin")
        keys = ", ".join(using) if using else (cond._name if cond is not None else "")
        df = DataFrame(out, cols, self._session, _Plan(strategy, f"[{keys}], {jtype}", [self._plan, other._plan]))
        df._nparts = self._session._shuffle_parts()
        df._dup_cols = dup
        return df

    def crossJoin(self, other):
        return self.join(other, how="cross")

    def union(self, other):
        if len(self._cols) != len(other._cols):
            raise AnalysisException(f"[NUM_COLUMNS_MISMATCH] UNION can only be performed on inputs with the same number of columns, but the first input has {len(self._cols)} columns and the second input has {len(other._cols)} columns.")
        out = list(self._rows) + [dict(zip(self._cols, [r.get(c) for c in other._cols])) for r in other._rows]
        return DataFrame(out, self._cols, self._session, _Plan("Union", "", [self._plan, other._plan]))

    unionAll = union

    def unionByName(self, other, allowMissingColumns=False):
        missing = [c for c in self._cols if c not in other._cols] + [c for c in other._cols if c not in self._cols]
        if missing and not allowMissingColumns:
            raise AnalysisException(f"[UNRESOLVED_COLUMN] Cannot resolve column(s) {missing} for unionByName. Pass allowMissingColumns=True.")
        cols = self._cols + [c for c in other._cols if c not in self._cols]
        out = [{c: r.get(c) for c in cols} for r in self._rows] + [{c: r.get(c) for c in cols} for r in other._rows]
        return DataFrame(out, cols, self._session, _Plan("Union", "byName", [self._plan, other._plan]))

    def intersect(self, other):
        ks = {tuple(_hashable(r.get(c)) for c in other._cols) for r in other._rows}
        return self.distinct().filter(Column(lambda ctx: tuple(_hashable(ctx.row.get(c)) for c in self._cols) in ks, "intersect"))

    def subtract(self, other):
        ks = {tuple(_hashable(r.get(c)) for c in other._cols) for r in other._rows}
        return self.distinct().filter(Column(lambda ctx: tuple(_hashable(ctx.row.get(c)) for c in self._cols) not in ks, "except"))

    exceptAll = subtract

    def fillna(self, value, subset=None):
        if isinstance(subset, str):
            subset = [subset]
        out = []
        for r in self._rows:
            d = dict(r)
            if isinstance(value, dict):
                for k, v in value.items():
                    if d.get(k) is None:
                        d[k] = v
            else:
                for c in (subset or self._cols):
                    if d.get(c) is None:
                        vals = [x.get(c) for x in self._rows if x.get(c) is not None]
                        t = type(vals[0]) if vals else type(value)
                        if isinstance(value, str) and t is str or isinstance(value, (int, float)) and not isinstance(value, bool) and t in (int, float) or t is type(value):
                            d[c] = float(value) if t is float else value
            out.append(d)
        return self._derive(out, self._cols, ("Project", "fillna"))

    def dropna(self, how="any", thresh=None, subset=None):
        if isinstance(subset, str):
            subset = [subset]
        cs = subset or self._cols
        out = []
        for r in self._rows:
            nn = _py_sum(1 for c in cs if r.get(c) is not None)
            if thresh is not None:
                keep = nn >= thresh
            elif how == "all":
                keep = nn > 0
            else:
                keep = nn == len(cs)
            if keep:
                out.append(r)
        return self._derive(out, self._cols, ("Filter", "dropna"))

    def replace(self, to_replace, value=None, subset=None):
        mp = to_replace if isinstance(to_replace, dict) else ({to_replace: value} if not isinstance(to_replace, list) else dict(zip(to_replace, value if isinstance(value, list) else [value] * len(to_replace))))
        cs = subset or self._cols
        out = [{k: (mp.get(v, v) if k in cs and not isinstance(v, (list, dict)) else v) for k, v in r.items()} for r in self._rows]
        return self._derive(out, self._cols, ("Project", "replace"))

    def sample(self, withReplacement=None, fraction=None, seed=None):
        import random
        rnd = random.Random(seed or 7)
        if isinstance(withReplacement, float):
            fraction = withReplacement
        return self._derive([r for r in self._rows if rnd.random() < fraction], self._cols, ("Sample", str(fraction)))

    def repartition(self, n=None, *cols):
        df = self._derive(self._rows, self._cols, ("Exchange", f"hashpartitioning({', '.join(str(c) for c in cols) or 'RoundRobin'}, {n})"))
        if isinstance(n, int):
            df._nparts = n
        else:
            df._nparts = self._session._shuffle_parts()
        return df

    def coalesce(self, n):
        df = self._derive(self._rows, self._cols, ("Coalesce", str(n)))
        df._nparts = _py_min(n, self._nparts)
        return df

    def cache(self):
        self._cached = True
        self._plan = _Plan("InMemoryTableScan", "cached", [self._plan])
        return self

    def persist(self, storageLevel=None):
        return self.cache()

    def unpersist(self, blocking=False):
        self._cached = False
        return self

    def hint(self, name, *params):
        if name.lower() == "broadcast":
            return broadcast(self)
        return self

    def transform(self, func, *args, **kwargs):
        return func(self, *args, **kwargs)

    def checkpoint(self, eager=True):
        return self._derive(self._rows, self._cols, ("LogicalRDD", "checkpoint (lineage truncated)"), children=[])

    localCheckpoint = checkpoint

    # ---- actions
    def collect(self):
        return [Row._make(self._cols, [r.get(c) for c in self._cols]) for r in self._rows]

    def count(self):
        return len(self._rows)

    def first(self):
        rows = self.collect()
        return rows[0] if rows else None

    def head(self, n=None):
        if n is None:
            return self.first()
        return self.collect()[:n]

    def take(self, n):
        return self.collect()[:n]

    def tail(self, n):
        return self.collect()[-n:]

    def isEmpty(self):
        return len(self._rows) == 0

    def toLocalIterator(self):
        return iter(self.collect())

    def foreach(self, f):
        for r in self.collect():
            f(r)

    def toPandas(self):
        raise AnalysisException("toPandas() is not available in the in-browser Spark. Use collect() or show().")

    def toJSON(self):
        return [_json.dumps({c: (_fmt(r.get(c)) if isinstance(r.get(c), (_dt.date,)) else r.get(c)) for c in self._cols}) for r in self._rows]

    def show(self, n=20, truncate=True, vertical=False):
        rows = self._rows[:n]
        cells = [[_fmt(r.get(c)) for c in self._cols] for r in rows]
        if truncate:
            lim = 20 if truncate is True else int(truncate)
            cells = [[(v[:lim - 3] + "...") if len(v) > lim else v for v in row] for row in cells]
        if vertical:
            for i, row in enumerate(cells):
                print(f"-RECORD {i}" + "-" * 20)
                w = _py_max((len(c) for c in self._cols), default=0)
                for c, v in zip(self._cols, row):
                    print(f" {c.ljust(w)} | {v}")
            return
        widths = [_py_max([len(c)] + [len(row[i]) for row in cells]) for i, c in enumerate(self._cols)]
        sep = "+" + "+".join("-" * w for w in widths) + "+"
        print(sep)
        print("|" + "|".join(c.rjust(w) for c, w in zip(self._cols, widths)) + "|")
        print(sep)
        for row in cells:
            print("|" + "|".join(v.rjust(w) for v, w in zip(row, widths)) + "|")
        print(sep)
        if len(self._rows) > n:
            print(f"only showing top {n} row{'s' if n != 1 else ''}")
        print()

    def printSchema(self):
        print("root")
        for c, t in self.dtypes:
            print(f" |-- {c}: {t} (nullable = true)")
        print()

    def describe(self, *cols):
        cs = list(cols) or [c for c, t in self.dtypes if t in ("int", "bigint", "double")]
        stats = ["count", "mean", "stddev", "min", "max"]
        out = []
        for s in stats:
            d = {"summary": s}
            for c in cs:
                v = [r.get(c) for r in self._rows if r.get(c) is not None]
                if s == "count":
                    d[c] = str(len(v))
                elif s == "mean":
                    d[c] = str(_py_sum(v) / len(v)) if v and all(isinstance(x, (int, float)) for x in v) else None
                elif s == "stddev":
                    vv = _var(v) if v and all(isinstance(x, (int, float)) for x in v) else None
                    d[c] = str(_math.sqrt(vv)) if vv is not None else None
                elif s == "min":
                    d[c] = _fmt(_py_min(v, key=_sort_key)) if v else None
                else:
                    d[c] = _fmt(_py_max(v, key=_sort_key)) if v else None
            out.append(d)
        return DataFrame(out, ["summary"] + cs, self._session)

    summary = describe

    def explain(self, extended=False, mode=None):
        lines = ["== Physical Plan ==", "AdaptiveSparkPlan isFinalPlan=false"]

        def walk(p, depth):
            op = p.op
            label = {
                "Scan": "Scan", "Project": "Project", "Filter": "Filter", "Sort": "Sort", "GlobalLimit": "CollectLimit",
                "Union": "Union", "SubqueryAlias": "", "BroadcastHint": "", "Coalesce": "Coalesce", "InMemoryTableScan": "InMemoryTableScan",
            }.get(op, op)
            pre = "   " * depth + ("+- " if depth else "+- ")
            if op in ("SubqueryAlias", "BroadcastHint"):
                for ch in p.children:
                    walk(ch, depth)
                return
            if op.startswith("HashAggregate"):
                lines.append(pre + f"HashAggregate(keys=[{p.detail}], functions=[...])")
                lines.append("   " * (depth + 1) + f"+- Exchange hashpartitioning({p.detail}, {self._session._shuffle_parts()}), ENSURE_REQUIREMENTS   <-- SHUFFLE (wide)")
                lines.append("   " * (depth + 2) + "+- HashAggregate(partial)   <-- map-side combine")
                for ch in p.children:
                    walk(ch, depth + 3)
                return
            if op == "Sort":
                lines.append(pre + f"Sort [{p.detail}], true")
                lines.append("   " * (depth + 1) + f"+- Exchange rangepartitioning({p.detail}, {self._session._shuffle_parts()})   <-- SHUFFLE (wide)")
                for ch in p.children:
                    walk(ch, depth + 2)
                return
            if op == "SortMergeJoin":
                lines.append(pre + f"SortMergeJoin {p.detail}")
                for ch in p.children:
                    lines.append("   " * (depth + 1) + "+- Sort")
                    lines.append("   " * (depth + 2) + "+- Exchange hashpartitioning(join keys)   <-- SHUFFLE both sides")
                    walk(ch, depth + 3)
                return
            if op == "BroadcastHashJoin":
                lines.append(pre + f"BroadcastHashJoin {p.detail}, BuildRight   <-- small side shipped to every executor, no shuffle of big side")
                walk(p.children[0], depth + 1)
                lines.append("   " * (depth + 1) + "+- BroadcastExchange HashedRelationBroadcastMode")
                if len(p.children) > 1:
                    walk(p.children[1], depth + 2)
                return
            if op == "Window":
                lines.append(pre + f"Window [{p.detail}]")
                lines.append("   " * (depth + 1) + "+- Sort [partition keys, order keys]")
                lines.append("   " * (depth + 2) + "+- Exchange hashpartitioning(partition keys)   <-- SHUFFLE (wide)")
                for ch in p.children:
                    walk(ch, depth + 3)
                return
            lines.append(pre + f"{label} {p.detail}".rstrip())
            for ch in p.children:
                walk(ch, depth + 1)
        walk(self._plan, 0)
        print("\n".join(lines))
        print()

    def createOrReplaceTempView(self, name):
        self._session._views[name.lower()] = self

    createTempView = createOrReplaceTempView
    registerTempTable = createOrReplaceTempView
    createOrReplaceGlobalTempView = createOrReplaceTempView

    def __repr__(self):
        return "DataFrame[" + ", ".join(f"{c}: {t}" for c, t in self.dtypes) + "]"


class GroupedData:
    def __init__(self, df, keys):
        self._df, self._keys = df, keys
        self._pivot = None

    def pivot(self, pivot_col, values=None):
        g = GroupedData(self._df, self._keys)
        pc = col(pivot_col) if isinstance(pivot_col, str) else pivot_col
        if values is None:
            values = sorted({pc._ev(_Ctx(r)) for r in self._df._ctxrows()} - {None}, key=_sort_key)
        g._pivot = (pc, list(values))
        return g

    def agg(self, *exprs):
        if len(exprs) == 1 and isinstance(exprs[0], dict):
            exprs = [{"avg": avg, "mean": avg, "sum": sum, "min": min, "max": max, "count": count, "first": first, "last": last}[f.lower()](c)
                     for c, f in exprs[0].items()]
        exprs = list(exprs)
        for e in exprs:
            if not e._contains_agg():
                raise AnalysisException(f"[MISSING_AGGREGATION] The non-aggregating expression '{e._name}' is not allowed in agg(). Put grouping columns in groupBy(...).")
        self._df._check_cols(self._keys + [e._aggcol if hasattr(e, "_aggcol") else e for e in exprs if not getattr(e, "_countstar", False)])
        rows = self._df._ctxrows()
        groups = {}
        order = []
        for r in rows:
            k = tuple(_hashable(c._ev(_Ctx(r))) for c in self._keys)
            if k not in groups:
                groups[k] = []
                order.append(k)
            groups[k].append(r)
        if not self._keys and not rows:
            groups[()] = []
            order = [()]
        knames = [c._name for c in self._keys]
        out = []
        if self._pivot:
            pc, pvals = self._pivot
            names = knames + ([str(v) if len(exprs) == 1 else f"{v}_{e._name}" for v in pvals for e in exprs])
            for k in order:
                g = groups[k]
                d = dict(zip(knames, [self._keys[i]._ev(_Ctx(g[0])) for i in range(len(self._keys))]))
                for v in pvals:
                    sub = [r for r in g if pc._ev(_Ctx(r)) == v]
                    for e in exprs:
                        nm = str(v) if len(exprs) == 1 else f"{v}_{e._name}"
                        d[nm] = e._ev(_Ctx(sub[0] if sub else {}, sub)) if sub else (0 if getattr(e, "_countstar", False) and False else None)
                out.append(d)
            df = self._df._derive(out, names, ("HashAggregate(pivot)", ", ".join(knames)))
            df._nparts = self._df._session._shuffle_parts()
            return df
        names = knames + [e._name for e in exprs]
        for k in order:
            g = groups[k]
            first_row = g[0] if g else {}
            d = {}
            for i, c in enumerate(self._keys):
                d[knames[i]] = c._ev(_Ctx(first_row))
            for e in exprs:
                d[e._name] = e._ev(_Ctx(first_row, g))
            out.append(d)
        df = self._df._derive(out, names, ("HashAggregate", ", ".join(knames) or "()"))
        df._nparts = self._df._session._shuffle_parts() if self._keys else 1
        return df

    def count(self):
        c = count("*").alias("count")
        return self.agg(c)

    def _simple(self, fn, cols):
        if not cols:
            cols = [c for c, t in self._df.dtypes if t in ("int", "bigint", "double") and c not in [k._name for k in self._keys]]
        return self.agg(*[fn(c) for c in cols])

    def sum(self, *cols):
        return self._simple(sum, cols)

    def avg(self, *cols):
        return self._simple(avg, cols)

    mean = avg

    def max(self, *cols):
        return self._simple(max, cols)

    def min(self, *cols):
        return self._simple(min, cols)


class _Writer:
    def __init__(self, df):
        self._df, self._mode, self._fmt, self._parts, self._opts = df, "errorifexists", "parquet", [], {}

    def mode(self, m):
        self._mode = m
        return self

    def format(self, f):
        self._fmt = f
        return self

    def option(self, k, v):
        self._opts[k] = v
        return self

    def options(self, **kw):
        self._opts.update(kw)
        return self

    def partitionBy(self, *cols):
        self._parts = list(_flat(cols))
        return self

    def bucketBy(self, n, *cols):
        return self

    def sortBy(self, *cols):
        return self

    def _report(self, path):
        print(f"[write] format={self._fmt} mode={self._mode} path={path}")
        if self._parts:
            vals = sorted({tuple(r.get(p) for p in self._parts) for r in self._df._rows}, key=lambda t: tuple(_sort_key(x) for x in t))
            print(f"[write] partitioned by {self._parts} -> {len(vals)} folder(s), e.g.:")
            for v in vals[:5]:
                print("   " + path.rstrip("/") + "/" + "/".join(f"{p}={_fmt(x)}" for p, x in zip(self._parts, v)) + "/part-00000.snappy." + self._fmt)
        else:
            print(f"[write] {self._df._nparts} file(s) (one per partition): {path.rstrip('/')}/part-0000*.{self._fmt}")
        print(f"[write] {self._df.count()} rows written (simulated - nothing leaves your browser)")
        self._df._session._files[path] = self._df

    def save(self, path=None):
        self._report(path or self._opts.get("path", "/tmp/out"))

    def parquet(self, path, mode=None, partitionBy=None):
        if mode:
            self._mode = mode
        if partitionBy:
            self.partitionBy(partitionBy)
        self._fmt = "parquet"
        self._report(path)

    def csv(self, path, mode=None, header=None):
        self._fmt = "csv"
        if mode:
            self._mode = mode
        self._report(path)

    def json(self, path, mode=None):
        self._fmt = "json"
        self._report(path)

    def saveAsTable(self, name):
        print(f"[write] saved as managed table `{name}` ({self._df.count()} rows). Query it with spark.table('{name}').")
        self._df._session._views[name.lower()] = self._df

    def insertInto(self, name, overwrite=False):
        self.saveAsTable(name)


class _Reader:
    def __init__(self, s):
        self._s = s
        self._opts = {}

    def format(self, f):
        return self

    def option(self, k, v):
        self._opts[k] = v
        return self

    def options(self, **kw):
        self._opts.update(kw)
        return self

    def schema(self, s):
        return self

    def table(self, name):
        return self._s.table(name)

    def _file(self, path):
        if path in self._s._files:
            return self._s._files[path]
        name = path.rstrip("/").split("/")[-1].split(".")[0]
        try:
            return self._s.table(name)
        except AnalysisException:
            raise AnalysisException(f"[PATH_NOT_FOUND] Path does not exist: {path}. In this sandbox, read files you wrote earlier or a table name, e.g. spark.read.parquet('/lake/claims').")

    def parquet(self, path):
        return self._file(path)

    def csv(self, path, header=None, inferSchema=None, schema=None):
        return self._file(path)

    def json(self, path):
        return self._file(path)

    def load(self, path=None):
        return self._file(path)


class _Conf:
    def __init__(self):
        self._d = {"spark.sql.shuffle.partitions": "200", "spark.sql.adaptive.enabled": "true",
                   "spark.sql.autoBroadcastJoinThreshold": "10485760", "spark.executor.memory": "4g", "spark.executor.cores": "4"}

    def set(self, k, v):
        self._d[k] = str(v)

    def get(self, k, default=None):
        return self._d.get(k, default)


class SparkSession:
    _active = None

    class Builder:
        def appName(self, n):
            return self

        def master(self, m):
            return self

        def config(self, *a, **k):
            return self

        def enableHiveSupport(self):
            return self

        def getOrCreate(self):
            if SparkSession._active is None:
                SparkSession._active = SparkSession()
            return SparkSession._active

    builder = Builder()

    def __init__(self):
        self._views = {}
        self._files = {}
        self.conf = _Conf()
        self.read = _Reader(self)
        self.sparkContext = _types.SimpleNamespace(defaultParallelism=8, setLogLevel=lambda lvl: None, appName="de-arcade")
        self.catalog = _types.SimpleNamespace(listTables=lambda: [_types.SimpleNamespace(name=n) for n in _list_tables()] + [_types.SimpleNamespace(name=n) for n in self._views],
                                              dropTempView=lambda n: self._views.pop(n.lower(), None) is not None,
                                              cacheTable=lambda n: None, clearCache=lambda: None)
        self.version = "3.5.1 (in-browser teaching runtime)"

    def _shuffle_parts(self):
        try:
            return int(self.conf.get("spark.sql.shuffle.partitions"))
        except (TypeError, ValueError):
            return 200

    def stop(self):
        pass

    def table(self, name):
        if name.lower() in self._views:
            return self._views[name.lower()]
        cols, rows = _base_query(f"SELECT * FROM {name}")
        df = DataFrame([dict(zip(cols, r)) for r in rows], cols, self, _Plan("FileScan", f"parquet {name} [{', '.join(cols)}]", []))
        df._nparts = 8
        return df

    def range(self, start, end=None, step=1, numPartitions=None):
        if end is None:
            start, end = 0, start
        return DataFrame([{"id": i} for i in builtins_range(start, end, step)], ["id"], self, _Plan("Range", f"({start}, {end}, step={step})", []))

    def createDataFrame(self, data, schema=None, samplingRatio=None, verifySchema=True):
        data = list(data)
        names = None
        types_ = None
        if isinstance(schema, StructType):
            names = schema.names
            types_ = [f.dataType for f in schema.fields]
        elif isinstance(schema, (list, tuple)):
            names = list(schema)
        elif isinstance(schema, str):
            parts = [p.strip() for p in schema.split(",")]
            names = [p.split()[0].strip("`") for p in parts]
            types_ = [_parse_type(p.split(None, 1)[1]) if len(p.split()) > 1 else None for p in parts]
        rows = []
        for item in data:
            if isinstance(item, dict):
                if names is None:
                    names = list(item.keys())
                vals = [item.get(n) for n in names]
            elif isinstance(item, Row) and item.__fields__:
                if names is None:
                    names = list(item.__fields__)
                vals = list(item)
            elif isinstance(item, (list, tuple)):
                vals = list(item)
            else:
                vals = [item]
            if names is None:
                names = [f"_{i + 1}" for i in builtins_range(len(vals))]
            if len(vals) != len(names):
                raise AnalysisException(f"[LENGTH_SHOULD_BE_THE_SAME] Row has {len(vals)} values but the schema has {len(names)} columns: {names}")
            if types_:
                vals = [(_cast(v, t) if t is not None and not isinstance(t, (DateType, TimestampType)) or isinstance(v, str) else v) if t is not None else v
                        for v, t in zip(vals, types_)]
            rows.append(dict(zip(names, vals)))
        if names is None:
            names = []
        return DataFrame(rows, names, self, _Plan("Scan", "ExistingRDD", []))

    def sql(self, query):
        cols, rows = _base_query(query, self._views)
        df = DataFrame([dict(zip(cols, r)) for r in rows], cols, self, _Plan("SQL", query.strip().split("\n")[0][:80], []))
        df._nparts = self._shuffle_parts()
        return df


builtins_range = _b.range


def _list_tables():
    cols, rows = _base_query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    return [r[0] for r in rows]


def _base_query(query, views=None):
    """Run SQL on the practice warehouse (SQLite engine in the page) with temp views materialized."""
    payload = {}
    for name, df in (views or {}).items():
        payload[name] = {"cols": df._cols, "rows": [[_jsonable(r.get(c)) for c in df._cols] for r in df._rows]}
    try:
        import js  # provided by the Pyodide worker
        res = _json.loads(js.runSqlForPython(query, _json.dumps(payload)))
    except ImportError:
        raise AnalysisException("SQL bridge unavailable")
    if res.get("error"):
        raise AnalysisException(f"[SQL_ERROR] {res['error']}")
    return res["cols"], res["rows"]


def _jsonable(v):
    if isinstance(v, _dt.datetime):
        return v.strftime("%Y-%m-%d %H:%M:%S")
    if isinstance(v, _dt.date):
        return v.isoformat()
    if isinstance(v, (list, dict)):
        return _json.dumps(v, default=str)
    return v


# ----------------------------------------------------------------- module wiring
# Expose as `pyspark`, `pyspark.sql`, `pyspark.sql.functions`, `pyspark.sql.types`, `pyspark.sql.window`

def _install():
    me = _sys.modules[__name__]
    pyspark = _types.ModuleType("pyspark")
    sql = _types.ModuleType("pyspark.sql")
    functions = _types.ModuleType("pyspark.sql.functions")
    types = _types.ModuleType("pyspark.sql.types")
    window_mod = _types.ModuleType("pyspark.sql.window")
    utils = _types.ModuleType("pyspark.sql.utils")
    errors = _types.ModuleType("pyspark.errors")
    fn_names = ["col", "column", "lit", "expr", "when", "coalesce", "nvl", "ifnull", "nullif", "isnull", "isnan", "greatest", "least",
                "sum", "sum_distinct", "sumDistinct", "avg", "mean", "count", "countDistinct", "count_distinct", "approx_count_distinct", "min", "max",
                "first", "last", "collect_list", "collect_set", "stddev", "stddev_samp", "stddev_pop", "variance", "var_samp", "percentile_approx", "median",
                "row_number", "rank", "dense_rank", "percent_rank", "cume_dist", "ntile", "lag", "lead", "nth_value",
                "upper", "lower", "trim", "ltrim", "rtrim", "length", "initcap", "reverse", "concat", "concat_ws", "substring", "split",
                "regexp_replace", "regexp_extract", "lpad", "rpad", "instr", "translate", "abs", "sqrt", "exp", "log", "log10", "pow", "power", "ceil",
                "floor", "round", "bround", "md5", "sha2", "size", "to_date", "to_timestamp", "date_format", "datediff", "months_between", "date_add",
                "date_sub", "add_months", "date_trunc", "trunc", "current_date", "current_timestamp", "unix_timestamp", "year", "month", "dayofmonth",
                "dayofweek", "dayofyear", "weekofyear", "quarter", "hour", "minute", "last_day", "window", "array", "array_contains", "array_distinct",
                "sort_array", "struct", "explode", "explode_outer", "posexplode", "monotonically_increasing_id", "spark_partition_id",
                "input_file_name", "broadcast", "udf", "pandas_udf", "asc", "desc", "asc_nulls_last", "desc_nulls_first"]
    for n in fn_names:
        setattr(functions, n, getattr(me, n))
    for n in ["DataType", "StringType", "IntegerType", "LongType", "ShortType", "DoubleType", "FloatType", "BooleanType", "DateType",
              "TimestampType", "BinaryType", "DecimalType", "ArrayType", "StructType", "StructField"]:
        setattr(types, n, getattr(me, n))
    types.Row = Row
    window_mod.Window = Window
    window_mod.WindowSpec = WindowSpec
    for n in ["SparkSession", "DataFrame", "Column", "Row", "Window", "GroupedData"]:
        setattr(sql, n, getattr(me, n))
    sql.functions, sql.types, sql.window = functions, types, window_mod
    utils.AnalysisException = AnalysisException
    errors.AnalysisException = AnalysisException
    errors.PySparkException = AnalysisException
    sql.utils = utils
    pyspark.sql = sql
    pyspark.errors = errors
    pyspark.StorageLevel = _types.SimpleNamespace(MEMORY_ONLY="MEMORY_ONLY", MEMORY_AND_DISK="MEMORY_AND_DISK", DISK_ONLY="DISK_ONLY")
    pyspark.__version__ = "3.5.1"
    _sys.modules.update({"pyspark": pyspark, "pyspark.sql": sql, "pyspark.sql.functions": functions, "pyspark.sql.types": types,
                         "pyspark.sql.window": window_mod, "pyspark.sql.utils": utils, "pyspark.errors": errors})


_install()
