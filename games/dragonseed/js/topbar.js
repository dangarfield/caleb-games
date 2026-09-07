/* topbar.js — date, served, confusion, and the message line. */

(function () {

  /* The strip re-renders on every state change, so a fresh element would
     replay its arrival animation constantly. Only a message you have not seen
     before gets to flash. */
  var lastMsg = null;

  function renderTop(root) {
    var st = Engine.state, d = Engine.today();

    var left = Engine.el("div", "top__left");
    var back = Engine.el("a", "backbtn", "← Games");
    back.href = "../../index.html";
    left.appendChild(back);
    /* the day is a button: it opens the state timeline, which is a debugging
       tool and looks like nothing at all until you press it */
    left.appendChild(Engine.btn("top__day", "Day " + d.day,
      function () { Engine.openDebug(true); }, "State timeline"));
    left.appendChild(Engine.el("span", "top__weekday", d.weekday));
    left.appendChild(Engine.btn("helpbtn", "?", function () { Engine.showModal({ kind: "help" }); },
                                "How to play"));
    root.appendChild(left);

    var mid = Engine.el("div", "top__mid");
    if (st.message) {
      var key = (st.messageKind || "info") + "|" + st.message;
      var fresh = key !== lastMsg;
      lastMsg = key;
      var m = Engine.el("p", "msg msg--" + (st.messageKind || "info")
                             + (fresh ? " msg--new" : ""), st.message);
      m.setAttribute("role", "status");
      m.addEventListener("click", Engine.clearMessage);
      mid.appendChild(m);
    } else {
      lastMsg = null;
      mid.appendChild(Engine.el("p", "top__note", d.note));
    }
    root.appendChild(mid);

    var right = Engine.el("div", "top__right");
    var served = Engine.el("span", "meter", "");
    served.appendChild(Engine.el("b", null, String(st.served)));
    served.appendChild(document.createTextNode(" served"));
    right.appendChild(served);

    var muddle = Engine.el("span", "meter meter--muddle");
    muddle.setAttribute("aria-label",
      "Confusion " + st.confusion + " of " + Engine.MUDDLE_CAP);
    muddle.appendChild(document.createTextNode("confusion "));
    var pips = Engine.el("span", "pips");
    for (var i = 0; i < Engine.MUDDLE_CAP; i++)
      pips.appendChild(Engine.el("i", "pip" + (i < st.confusion ? " pip--on" : "")));
    muddle.appendChild(pips);
    right.appendChild(muddle);

    /* The hint sits next to the thing it costs. It used to be at the bottom of
       the visitor rail, a long way from the confusion meter that pays for it. */
    /* The second press on the same customer gives the answer away, so the
       button says so rather than pretending to be the same button twice. */
    if (Engine.canHint()) {
      var told = Engine.hintLevel() >= 1;
      right.appendChild(Engine.btn("hintbtn" + (told ? " hintbtn--tell" : ""),
        told ? "Tell me" : "Hint", Engine.hint,
        told ? "Just tell me which plant it is — it costs a pip of confusion"
             : "Get a hint — it costs a pip of confusion"));
    }

    root.appendChild(right);
  }
  Engine.registerRegion("topbar", renderTop);
})();
