"""thps_trg.py — reader for THPS1 / THPS2 `.trg` node tables (rails, spawns).

Stdlib only. Derived from JayFoxRox/thps2-tools `disassemble-trg.py`, which
decodes node positions but leaves the connectivity fields labelled `unk`.

The working theory this module is built on, and which `--inspect` exists to
prove or disprove on real data:

    Every node in the table opens with a uint16 count followed by that many
    uint16s. In THPS3/4/THUG the equivalent array is the node's `Links` list,
    and `io_thps_scene/import_nodes.py::get_linked_path()` chains rails by
    walking `Links[0]`. The array is the same here — but on a PS1 .trg it is not
    purely the chain: a rail point that carries a trick hotspot lists that
    TrickOb first, so the successor is the first link that is itself a rail
    point, not simply the first link. See chain_rails.

If that turns out to be wrong on a given file, `chain_rails(..., by_order=True)`
falls back to the much blunter rule that a RailDef opens a chain and the
RailPoints that follow it in the table continue it.
"""

import struct

MAGIC = b"_TRG"

NODE_POINT = 3
NODE_ITEM = 5
NODE_RESTART = 8
NODE_RAILPOINT = 10
NODE_RAILDEF = 11
NODE_TRICKOB = 12
NODE_GOALOB = 14
NODE_MARKER = 13
NODE_TERMINATOR = 255

RAIL_TYPES = (NODE_RAILDEF, NODE_RAILPOINT)

# Node types whose body begins: links array, pad to 4, then an x/y/z vector.
POSITIONED = (NODE_POINT, NODE_ITEM, NODE_RESTART,
              NODE_RAILDEF, NODE_RAILPOINT, NODE_MARKER)

# The six pickups every park with a career has exactly one of. Five are the
# letters, in this order; the sixth is what is left over. See items().
ITEM_SKATE = (4, 5, 6, 10, 15)
ITEM_TAPE = 16


class TrgError(Exception):
    pass


class Node:
    __slots__ = ("index", "type", "links", "pos", "name", "kind")

    def __init__(self, index, type_):
        self.index = index
        self.type = type_
        self.links = []
        self.pos = None       # (x, y, z) in THPS units, already /4096
        self.name = None
        self.kind = None      # marker nodes only: (category, kind)

    @property
    def is_rail(self):
        return self.type in RAIL_TYPES

    def __repr__(self):
        return "Node(%d, type=%d, links=%s, pos=%s)" % (
            self.index, self.type, self.links, self.pos)


def load(path):
    with open(path, "rb") as fh:
        return loads(fh.read())


def loads(data):
    if data[:4] != MAGIC:
        raise TrgError("not a .trg file (magic %r)" % data[:4])
    version = struct.unpack_from("<I", data, 4)[0]
    if version != 2:
        raise TrgError("unsupported .trg version %d" % version)

    count = struct.unpack_from("<I", data, 8)[0]
    offsets = [struct.unpack_from("<I", data, 12 + 4 * i)[0] for i in range(count)]

    nodes = []
    for i, off in enumerate(offsets):
        limit = offsets[i + 1] if i + 1 < count else len(data)
        try:
            nodes.append(_read_node(data, i, off, limit))
        except (struct.error, IndexError):
            # A node we cannot decode is not fatal: it is almost certainly a
            # script or an enemy, and we only care about rails and spawns.
            nodes.append(Node(i, -1))
    return nodes


def _read_node(data, index, off, limit):
    p = off
    type_ = struct.unpack_from("<H", data, p)[0]
    p += 2
    n = Node(index, type_)

    if type_ not in POSITIONED:
        return n

    if type_ == NODE_ITEM:
        # A pickup opens with its item id, THEN the usual links array.
        n.kind = struct.unpack_from("<H", data, p)[0]
        p += 2

    n_links = struct.unpack_from("<H", data, p)[0]
    p += 2
    if p + 2 * n_links > limit:
        return Node(index, -1)       # the array is not what we thought it was
    for _ in range(n_links):
        n.links.append(struct.unpack_from("<H", data, p)[0])
        p += 2

    p += (4 - (p % 4)) % 4           # align to 4 bytes, measured from file start
    if p + 12 > limit:
        return Node(index, -1)
    x, y, z = struct.unpack_from("<iii", data, p)
    p += 12
    # NOT divided by 4096. The reference disassembler prints these as x/4096 to
    # make them human-sized, which reads like a fixed-point conversion and is
    # not: measured against real geometry, a node's raw int32 is already in the
    # same units as `object_origin/4096 + vertex`. Divide and every rail in the
    # park collapses into a 1 m cube at the origin.
    n.pos = (float(x), float(y), float(z))

    if type_ == NODE_MARKER and p + 4 <= limit:
        """A marker's last four bytes are two uint16s: a category and a kind.

        (1, 1) is the one that matters. In the Warehouse there are exactly five
        of them, spread across the park, every one floating 1.9 m above the
        surface below it — which is where a THPS pickup sits and where nothing
        else does. The same holds in the Skate Park and Bonus Park 1. Bigger
        levels carry more than five, so they are candidate spots rather than
        the letters themselves; src/thps.js picks five spread out.
        """
        n.kind = struct.unpack_from("<HH", data, p)

    if type_ == NODE_RESTART:
        p += 6                        # three unknown uint16s
        end = data.find(b"\0", p, limit)
        if end > p:
            try:
                n.name = data[p:end].decode("latin-1")
            except Exception:
                pass
    return n


# ---------------------------------------------------------------------------

def links_look_like_node_indices(nodes):
    """Evidence for the working theory, as a ratio in 0..1.

    Counts the leading-array entries of rail nodes that both fall inside the
    node table and point at another rail node. On a file where the array really
    is the link list this should be at or very near 1.0.
    """
    total = hits = 0
    for n in nodes:
        if not n.is_rail:
            continue
        for l in n.links:
            total += 1
            if 0 <= l < len(nodes) and nodes[l].is_rail:
                hits += 1
    return (hits / total) if total else 0.0


def chain_rails(nodes, by_order=False):
    """Return rails as lists of (x, y, z) in THPS units.

    Default walks the links from every rail node that nothing else links to,
    taking the first link that is itself a rail point — see `successor`.
    `by_order=True` uses the fallback rule: a RailDef opens a chain, following
    RailPoints continue it.
    """
    rails = []
    if by_order:
        current = None
        for n in nodes:
            if n.pos is None:
                continue
            if n.type == NODE_RAILDEF:
                if current and len(current) >= 2:
                    rails.append(current)
                current = [n.pos]
            elif n.type == NODE_RAILPOINT and current is not None:
                current.append(n.pos)
        if current and len(current) >= 2:
            rails.append(current)
        return rails

    rail_idx = {n.index for n in nodes if n.is_rail and n.pos is not None}

    def successor(i):
        """The next point along this rail.

        NOT links[0]. A rail point's link array carries more than the chain: a
        point that a trick hotspot sits on lists that TrickOb FIRST and its own
        successor second, and following links[0] there walks off the rail into a
        node with no position, ending the chain one point in — which is why
        three edges of a planter were grindable and the fourth was not, and why
        a whole bench had nothing on it at all. So take the first link that is
        itself a rail point. Measured on School II: 79% of rail points ended up
        in a chain under links[0], 100% under this, and 104 chains became 136.
        """
        for x in nodes[i].links:
            if x in rail_idx:
                return x
        return None

    # who is pointed at?
    targeted = set()
    for i in rail_idx:
        nxt = successor(i)
        if nxt is not None:
            targeted.add(nxt)

    starts = [i for i in sorted(rail_idx) if i not in targeted]
    # a rail that is a pure closed loop has no unlinked start; seed from any
    # member we have not consumed yet
    visited = set()

    def walk(start):
        chain, seen = [], set()
        cur = start
        while cur in rail_idx and cur not in seen:
            seen.add(cur)
            visited.add(cur)
            chain.append(nodes[cur].pos)
            cur = successor(cur)
        closed = cur is not None and cur == start and len(chain) > 2
        return chain, closed

    for s in starts:
        chain, closed = walk(s)
        if len(chain) >= 2:
            if closed:
                chain = chain + [chain[0]]
            rails.append(chain)

    for i in sorted(rail_idx):                 # leftover loops, nothing links in
        if i in visited:
            continue
        chain, closed = walk(i)
        if len(chain) >= 2:
            rails.append(chain + [chain[0]] if closed else chain)

    return rails


def spawns(nodes):
    return [(n.pos, n.name) for n in nodes
            if n.type == NODE_RESTART and n.pos is not None]


def items(nodes):
    """Every type-5 pickup in the park: (position, item id).

    Type 5 is the item table, and it is the one that matters. Each node is an
    id, a links array, a position, and a short tail. Across the twenty parks
    the ids fall into two groups:

    * 4, 5, 6, 10, 15 and 16 appear EXACTLY ONCE in every park that has a
      career — and nowhere at all in Marseille, Skatestreet, the Bullring,
      Burnside, Roswell or the Skate Park, which are the competition levels
      and have neither letters nor a tape. Dan checked five of them against
      the Hangar in-game: 5, 4, 6, 15 and 10 are S, K, A, T and E, to within
      a metre in plan. Which leaves 16 as the secret tape.
    * the rest come in bunches whose size changes park to park — 21/22/23 in
      THPS1, 24/25/26/33 in THPS2. Those are the level's own collectibles.

    Type 13 (see markers) was the earlier guess and is wrong: its spots are
    near-misses for the real ones, which is what made it look right.
    """
    return [(n.pos, n.kind) for n in nodes
            if n.type == NODE_ITEM and n.pos is not None and n.kind is not None]


def markers(nodes):
    """Every positioned type-13 node, with the two numbers it carries.

    These were the first guess at the item spots and they are NOT it — see
    items(), which is. They sit a metre or two from the real pickups, which is
    exactly what made them convincing: five of them in the Warehouse landed
    near enough to the letters to look like the letters.

    What they actually are is still unsettled. The 412 of them across the
    twenty parks split by kind into (1,1) x241, (2,2) x83, (2,6) x30, (2,1)
    and (2,0) x21 each, (2,4) x10 and (2,5) x6.

    Kept because the nine parks with no item table — the competition levels
    and the three invented ones — have no letters of their own, and the arcade
    would rather scatter five than go without.
    """
    return [(n.pos, n.kind or (0, 0)) for n in nodes
            if n.type == NODE_MARKER and n.pos is not None]
