"""Only these developer-authored functions run. Never eval/exec submitted text."""
import sqlite3


def unique(value):
    return list(dict.fromkeys(value))


def order(value):
    if value["method"] != "POST":
        return {"status": 405}
    quantity = value["body"].get("quantity")
    return {"status": 201 if type(quantity) is int and quantity > 0 else 422}


def authorize(value):
    user = value["user"]
    return bool(user and user.get("tenant") and user["tenant"] == value["record"].get("tenant"))


def query(value):
    return {"query": "SELECT id FROM records WHERE tenant = ? ORDER BY id", "params": [value["tenant"]]}


def validate(value):
    return type(value) is int and 1 <= value <= 100


def paginate(value):
    page, size = value["page"], value["size"]
    return value["items"][page * size:(page + 1) * size] if page >= 0 and size > 0 else []


REFERENCE = {"PY-001": unique, "API-001": order, "AUTH-001": authorize, "SQL-001": query, "VAL-001": validate, "REG-001": paginate}
BROKEN = {
    "PY-001": lambda value: sorted(set(value)),
    "API-001": lambda value: {"status": 201},
    "AUTH-001": lambda value: bool(value["user"]),
    "SQL-001": lambda value: {"query": f"SELECT id FROM records WHERE tenant = '{value['tenant']}' ORDER BY id", "params": []},
    "VAL-001": lambda value: isinstance(value, int) and value > 0,
    "REG-001": lambda value: value["items"][value["page"] * value["size"]:(value["page"] + 1) * value["size"] - 1],
}


def execute_fixture(task_id, fixture_id, value):
    function = (REFERENCE if fixture_id == "reference" else BROKEN)[task_id]
    result = function(value)
    if task_id == "SQL-001":
        # SQL originates exclusively from the above fixed functions, never an upload.
        with sqlite3.connect(":memory:") as db:
            db.executescript("CREATE TABLE records(id INTEGER, tenant TEXT); INSERT INTO records VALUES(1, 'alpha'), (2, 'beta');")
            result = [list(row) for row in db.execute(result["query"], result["params"]).fetchall()]
    return result
