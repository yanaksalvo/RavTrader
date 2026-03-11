# === SAFETY PRELUDE: ensure majors & defaults exist (do not edit) ===
try:
    BIG_COINS
except NameError:
    BIG_COINS = ["BTCUSDT","ETHUSDT","BNBUSDT","SOLUSDT","ADAUSDT","AVAXUSDT","DOGEUSDT","XRPUSDT","TRXUSDT","LINKUSDT"]

_defaults = {
    "RSI_LONG_WATCH_default": 40.0,
    "RSI_SHORT_WATCH_default": 60.0,
    "BAND_FRAC_default": 0.35,
    "VOL_MULT_default": 1.0,
    # majors relaxed
    "RSI_LONG_WATCH_big": 35.0,
    "RSI_SHORT_WATCH_big": 65.0,
    "BAND_FRAC_big": 0.50,
    "VOL_MULT_big": 0.80,
}
for _k, _v in _defaults.items():
    if _k not in globals():
        globals()[_k] = _v
# === END SAFETY PRELUDE ===

# ==== Majör Coin Listesi (GLOBAL, dosyanın en başında) ====
BIG_COINS = [
    "BTCUSDT", "ETHUSDT", "BNBUSDT",
    "SOLUSDT", "ADAUSDT", "AVAXUSDT",
    "DOGEUSDT", "XRPUSDT", "TRXUSDT", "LINKUSDT"
]

# =============================
# API'SIZ (PUBLIC) SİNYAL BOTU — Intrabar RADAR, Kapalı Mum ONAY
# =============================
# - Public REST (Binance API key gerekmez)
# - Tarama modları:
#     SCAN_MODE = "15m_close"  -> sadece 15m kapanışlarında tarar (00/15/30/45 + tampon)
#     SCAN_MODE = "1m"         -> her dakika tarar (RADAR intrabar, ONAY kapalı 15m)
# - Mantık:
#   RADAR:
#       SHORT: RSI >= 70  + hacim_ok + (HIGH) direnç yakın   [intrabar ise kapanmamış 15m mum, değilse kapalı mum]
#       LONG : RSI <= 30  + hacim_ok + (LOW)  destek  yakın
#   ONAY (yalnız kapalı 15m muma göre ve bir SONRAKİ kapanışta):
#       LONG : 30 < RSI_closed ≤ 40  → LONG sinyali
#              RSI_closed > 40       → sinyal yok, radardan çıkar
#       SHORT: 60 ≤ RSI_closed < 70  → SHORT sinyali
#              RSI_closed < 60       → sinyal yok, radardan çıkar
# - Güven: SADECE RSI derinliği (+ küçük momentum bonusu), boost 1.2x, tavan %90
# - Çıktı: LONG/SHORT, fiyat, Güven %, gerekçe, data.json log

import sys, time, traceback, json
import numpy as np
import pytz
from datetime import datetime, timedelta
import requests

# === NETPATCH START (resilient requests + Binance fallback) ===
import requests as _np_requests
from requests.adapters import HTTPAdapter as _np_HTTPAdapter
from urllib3.util.retry import Retry as _np_Retry
from urllib.parse import urlparse as _np_urlparse, urlunparse as _np_urlunparse

_np_session = _np_requests.Session()
_np_retry = _np_Retry(
    total=3, connect=3, read=3, backoff_factor=0.7,
    status_forcelist=[429, 500, 502, 503, 504],
    allowed_methods=["GET", "HEAD"],
    raise_on_status=False,
)
_np_adapter = _np_HTTPAdapter(max_retries=_np_retry)
_np_session.mount("https://", _np_adapter)
_np_session.mount("http://", _np_adapter)

_np_orig_session_request = _np_requests.sessions.Session.request
_BINANCE_ALTS = ("api1.binance.com", "api2.binance.com", "api3.binance.com")

def _np_patched_request(self, method, url, *args, **kwargs):
    try:
        return _np_orig_session_request(self, method, url, *args, **kwargs)
    except Exception as _e1:
        parts = _np_urlparse(url)
        if parts.scheme in ("http","https") and parts.netloc == "api.binance.com":
            last_err = _e1
            for host in _BINANCE_ALTS:
                alt_url = _np_urlunparse(parts._replace(netloc=host))
                try:
                    return _np_orig_session_request(self, method, alt_url, *args, **kwargs)
                except Exception as _e2:
                    last_err = _e2
                    continue
            raise last_err
        raise

_np_requests.sessions.Session.request = _np_patched_request

def binance_ping_ok(timeout=5):
    try:
        r = _np_session.get("https://api.binance.com/api/v3/ping", timeout=timeout)
        if r.status_code == 200:
            return True
    except Exception:
        pass
    for host in _BINANCE_ALTS:
        try:
            r = _np_session.get(f"https://{host}/api/v3/ping", timeout=timeout)
            if r.status_code == 200:
                return True
        except Exception:
            pass
    return False
# === NETPATCH END ===

from requests import get as http_get
import talib as ta
from colorama import init
init(strip=not sys.stdout.isatty())
from termcolor import cprint
from pyfiglet import figlet_format

# ====== AYARLAR ======
SCAN_MODE = "1m"            # "15m_close" veya "1m"
INTRABAR_RADAR = True       # 1m modunda intrabar radar açık
CLOSE_BUFFER_SEC = 3.0      # 15m kapanışından sonra ekstra bekleme (sn) [15m modunda]

RSI_LEN      = 14
VOL_SMA      = 20
SR_LOOKBACK  = 50
VOL_MULT     = 1.0          # RADAR hacim eşiği: vol >= SMA20 * VOL_MULT
BAND_FRAC    = 0.35         # SR yakınlık bandı: range'in %35’i

# RSI eşikleri (radar ve onay bantları)
RSI_LONG_WATCH    = 30.0    # RADAR: LONG için RSI <= 30
RSI_SHORT_WATCH   = 70.0    # RADAR: SHORT için RSI >= 70
# ONAY bantları (kapalı 15m):
RSI_LONG_BAND_LOW  = 30.0   # (30, 40] sinyal ; >40 disarm
RSI_LONG_BAND_HIGH = 40.0
RSI_SHORT_BAND_LOW = 60.0   # [60, 70) sinyal ; <60 disarm
RSI_SHORT_BAND_HIGH= 70.0

# ====== TXT listesi ======
with open("coins_list_upper_comma.txt", "r", encoding="utf-8") as f:
    allowed_coins_raw = [s.strip() for s in f.read().strip().split(",") if s.strip()]

# ====== Alias düzeltmeleri ======
ALIAS_MAP = {
    "INCHUSDT": "1INCHUSDT",
    "SATSUSDT": "1000SATSUSDT",
    "APIUSDT": "API3USDT",
}
allowed_coins = [ALIAS_MAP.get(sym, sym) for sym in allowed_coins_raw]

# ====== Yardımcılar ======
def sma_series(arr, period):
    arr = np.asarray(arr, dtype=float)
    if len(arr) < period:
        return np.array([np.nan]*len(arr))
    return ta.SMA(arr, timeperiod=period)

def clamp(v, lo=0.0, hi=1.0):
    return max(lo, min(hi, v))

# === Güven yalnızca RSI’a göre (+ küçük momentum bonusu), boost içeride ===
def compute_confidence(side, rsi_last, last_close, prev_close, vol_last, vol_sma_last, support, resistance, rsi_prev=None):
    """
    Hacim ve SR etkisiz. Güven yalnızca RSI derinliği (+ küçük momentum bonusu) ile gelir.
    Çıkış: %0..%90, dahili 1.2x boost ve min %50 taban içerir.
    """
    side = str(side).lower()

    # RSI derinliği (0..1)
    if side in ("al", "long"):
        # LONG onay bandı: (30, 40] — 30'a yakınlık yüksek güven demek
        rsi_score = clamp((40.0 - rsi_last) / 10.0)   # 30->1.0, 35->0.5, 40->0.0
    else:
        # SHORT onay bandı: [60, 70) — 70'e yakınlık yüksek güven demek
        rsi_score = clamp((rsi_last - 60.0) / 10.0)   # 60->0.0, 65->0.5, 70->1.0

    # Momentum bonusu (+0.05)
    mom_bonus = 0.0
    if rsi_prev is not None:
        delta = rsi_last - rsi_prev
        if (side in ("al","long") and delta > 0) or (side in ("sat","short") and delta < 0):
            mom_bonus = 0.05

    score = clamp(0.95 * rsi_score + 0.05 * mom_bonus)

    conf = int(round(score * 100))   # 0..100
    conf = max(conf, 50)             # onay bandındaki sinyale min %50
    conf = int(round(conf * 1.2))    # dahili boost 1.2x
    return min(conf, 90)             # tavan %90

BASE_URL = "https://api.binance.com"

# ====== SEND TO BACKEND ======
def Json_DataWriter(datastore):
    # This data structure comes from print_reason
    try:
        # Since the bot historically output "type": "long_reason" or "short_reason",
        # let's map it to what the backend expects (type: LONG or SHORT)
        signal_type = "LONG"
        if "short" in str(datastore.get("type", "")).lower():
            signal_type = "SHORT"
            
        # Determine the status and pair format
        # Note: the input `symbol` is e.g. "BTCUSDT", backend expects pair: "BTC/USDT"
        symbol = datastore.get("symbol", "")
        pair = symbol.replace("USDT", "/USDT") if "USDT" in symbol else symbol
        
        # Build the payload for the backend API
        payload = {
            "id": f"{symbol}_{int(time.time() * 1000)}",
            "pair": pair,
            "symbol": symbol,
            "type": signal_type,
            "entry": datastore.get("price", 0),
            "takeProfit": datastore.get("tp", 0),
            "stopLoss": datastore.get("sl", 0),
            "rsi": datastore.get("rsi", 0),
            "priceChange": ((datastore.get("price", 0) - datastore.get("prev_price", 0)) / max(datastore.get("prev_price", 1e-9), 1e-9)) * 100,
            "volatility": "NORMAL", # Can calculate from ATR if needed, defaulting for now
            "confidence": datastore.get("confidence", 0),
            "timestamp": int(time.time() * 1000),
            "status": "pending"
        }
        
        # Send to the backend
        print(f"--> Sinyal Backend'e Gönderiliyor: {signal_type} {pair}")
        res = requests.post("http://localhost:3000/api/signals", json=payload, timeout=5)
        if res.status_code == 201:
            print("--> Backend'e başarıyla kaydedildi.")
        else:
            print(f"--> Backend kayıt hatası: {res.status_code} {res.text}")
    except Exception as e:
        print(f"--> Backend'e sinyal gönderilirken hata oluştu: {e}")

# ====== CIRCUIT BREAKER (BTC 1h ATR% spike) ======
_circuit_until_ts = 0

def _ema(arr, p):
    alpha = 2/(p+1)
    out = []
    prev = arr[0]
    for x in arr:
        prev = alpha*x + (1-alpha)*prev
        out.append(prev)
    return np.array(out, float)

def _atr_np(h, l, c, p=14):
    tr = np.maximum(h[1:], c[:-1]) - np.minimum(l[1:], c[:-1])
    # True Range components
    tr = np.maximum.reduce([
        h[1:] - l[1:],
        np.abs(h[1:] - c[:-1]),
        np.abs(l[1:] - c[:-1])
    ])
    atr = np.empty_like(c)
    atr[:] = np.nan
    # SMA init
    if len(tr) >= p:
        atr[p] = np.mean(tr[:p])
        for i in range(p+1, len(c)):
            atr[i] = (atr[i-1]*(p-1) + tr[i-1]) / p
    return atr

def circuit_breaker_active():
    import time
    return time.time() < _circuit_until_ts

def set_circuit(seconds=1800):
    import time
    global _circuit_until_ts
    _circuit_until_ts = max(_circuit_until_ts, time.time()+seconds)

def circuit_guard_btc(threshold_mult=1.8):
    kl = fetch_klines("BTCUSDT", "1h", 120)
    if not kl: 
        return False, 0.0, 0.0
    high = np.array([float(x[2]) for x in kl], float)
    low  = np.array([float(x[3]) for x in kl], float)
    close= np.array([float(x[4]) for x in kl], float)
    atr = _atr_np(high, low, close, 14)
    atrp = atr/np.maximum(close,1e-9)
    recent = atrp[-49:-1]
    med = np.nanmedian(recent) if recent.size else 0.0
    nowp = float(atrp[-1]) if not np.isnan(atrp[-1]) else 0.0
    return bool(med>0 and nowp > med*threshold_mult), nowp, med


def fetch_klines(symbol: str, interval: str = "15m", limit: int = 300):
    global bad_symbols
    try:
        resp = requests.get(
            f"{BASE_URL}/api/v3/klines",
            params={"symbol": symbol, "interval": interval, "limit": limit},
            timeout=12,
        )
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        # HTTP 400 -> invalid symbol -> permanent blacklist
        try:
            import requests as _rq
            if isinstance(e, _rq.HTTPError) and getattr(e, "response", None) is not None:
                if e.response.status_code == 400:
                    print(f"{symbol} klines çekilemedi: 400 Bad Request (geçersiz sembol). Kalıcı kara listeye alındı.")
                    bad_symbols.add(symbol)
                    return []
        except Exception:
            pass
        print(f"{symbol} klines çekilemedi (geçici): {e}")
        return []

# ====== Durum ======
bad_symbols = set()
My_coin_list = []   # <<< global list

# Radar/Onay state: radar ne zaman armlandı (closeTime)
long_state  = {}  # {symbol: {"armed": bool, "armed_ct": int}}
short_state = {}  # {symbol: {"armed": bool, "armed_ct": int}}

def Coin_Market_Control():
    """TXT listesindeki coinleri alias'layıp global My_coin_list'e yazar."""
    global My_coin_list
    My_coin_list.clear()
    My_coin_list.extend([ALIAS_MAP.get(sym, sym) for sym in allowed_coins_raw])
    if My_coin_list:
        print(f"[SCAN] {len(My_coin_list)} coin taranacak: {', '.join(My_coin_list[:15])}{' ...' if len(My_coin_list)>15 else ''}")
    return My_coin_list

# JSON_DataWriter function handles backend POST request now.
# Original definitions removed as they are updated above.


def print_reason(side, symbol, tf, last_day, last_price, prev_price, rsi_last,
                 vol_last, vol_ma, support, resistance, rsi_prev=None, extra_parts=None):
    # compute_confidence boost ve tavanı kendi içinde yapıyor
    conf = compute_confidence(side, rsi_last, last_price, prev_price,
                              vol_last, vol_ma, support, resistance,
                              rsi_prev=rsi_prev)

    # --- TP/SL hesapla ---
    side_l = str(side).lower()
    is_long = side_l in ("al", "long")
    if is_long:
        tp = last_price * (1.0 + 0.012)   # +%1.2
        sl = last_price * (1.0 - 0.03)    # -%3
        tp_pct = 1.2
        sl_pct = -3.0
    else:
        tp = last_price * (1.0 - 0.012)   # -%1.2
        sl = last_price * (1.0 + 0.03)    # +%3
        tp_pct = -1.2
        sl_pct = 3.0

    price_chg_pct = ((last_price - prev_price) / prev_price) * 100 if prev_price else 0.0
    arrow = "↑" if price_chg_pct >= 0 else "↓"

    parts = [
        f"RSI {rsi_last:.2f}",
        f"Fiyat {arrow} {price_chg_pct:.2f}% ({prev_price:.6g} ➝ {last_price:.6g})",
        f"Hacim {vol_last:.3g} / SMA{VOL_SMA} {vol_ma:.3g}",   # bilgi amaçlı
        f"Destek {support:.6g} / Direnç {resistance:.6g}",     # bilgi amaçlı
    ]
    if extra_parts:
        parts.extend(extra_parts)

    # TP/SL metnini sona ekle
    # Örn: 🎯 TP: 60720 (+%1.2) | 🛑 SL: 58200 (−%3)
    sign_tp = "+" if tp_pct >= 0 else "−"
    sign_sl = "+" if sl_pct >= 0 else "−"
    parts.append(f"🎯 TP: {tp:.6g} ({sign_tp}%{abs(tp_pct)}) | 🛑 SL: {sl:.6g} ({sign_sl}%{abs(sl_pct)})")

    label_map = {"al": "LONG", "sat": "SHORT", "long": "LONG", "short": "SHORT"}
    label = label_map.get(side_l, str(side).upper())
    label_lower = "long" if label == "LONG" else ("short" if label == "SHORT" else side_l)

    header = f"{last_price:.6g} | {symbol} | {tf} | {label} (Güven: {conf}%) gerekçesi: "
    msg = header + " • ".join(parts)

    print(); print(msg); print()

    Json_DataWriter({
        "type": f"{label_lower}_reason",
        "symbol": symbol,
        "timeframe": tf,
        "time": str(last_day),
        "price": last_price,
        "prev_price": prev_price,
        "rsi": rsi_last,
        "volume": vol_last,
        "volume_sma": vol_ma,
        "support": support,
        "resistance": resistance,
        "confidence": conf,
        "tp": tp,
        "sl": sl,
        "tp_pct": tp_pct,
        "sl_pct": sl_pct,
        "notes": extra_parts
    })


def get_closed_index(kl):
    """Son KAPALI 15m mumun indexi."""
    now_ms = int(datetime.utcnow().timestamp() * 1000)
    last_close_time = int(kl[-1][6])
    return (-1) if now_ms >= last_close_time else (-2)

def scan_once():
    # Circuit breaker check (BTC 1h ATR% spike)
    brk, nowp, med = circuit_guard_btc(threshold_mult=1.8)
    if brk:
        set_circuit(1800)
    if circuit_breaker_active():
        print('[CIRCUIT] ACTIVE — skip this cycle')
        return
    global Last_day
    u = datetime.utcnow().replace(tzinfo=pytz.utc)
    Last_day = u.astimezone(pytz.timezone("Europe/Istanbul"))
    My_list = Coin_Market_Control()

    for symbol in My_list:

        # ==== Coin-bazlı parametre seçimi (her sembolde en başta sabitle) ====
        if symbol in BIG_COINS:
            rsi_long_watch = RSI_LONG_WATCH_big
            rsi_short_watch = RSI_SHORT_WATCH_big
            band_frac = BAND_FRAC_big
            vol_mult = VOL_MULT_big
        else:
            rsi_long_watch = RSI_LONG_WATCH_default
            rsi_short_watch = RSI_SHORT_WATCH_default
            band_frac = BAND_FRAC_default
            vol_mult = VOL_MULT_default
        try:
            if symbol in bad_symbols:
                continue

            kl = fetch_klines(symbol, interval="15m", limit=300)
            if not kl or len(kl) < max(RSI_LEN, VOL_SMA, SR_LOOKBACK) + 5:
                if not kl:
                    if symbol in bad_symbols:
                        print(f"[SKIP] {symbol} klines alınamadı: 400 nedeniyle KALICI kara listede (tekrar denenmeyecek).")
                    else:
                        print(f"[SKIP] {symbol} klines alınamadı, GEÇİCİ atlanıyor (listede kalıyor).")
                continue

            # --- Kapalı mum verileri ---
            ci = get_closed_index(kl)       # kapalı mum indexi
            cc_time = int(kl[ci][6])        # kapalı mum closeTime
            high_c   = np.array([float(x[2]) for x in kl[:ci+1]], dtype=float)
            low_c    = np.array([float(x[3]) for x in kl[:ci+1]], dtype=float)
            close_c  = np.array([float(x[4]) for x in kl[:ci+1]], dtype=float)
            volume_c = np.array([float(x[5]) for x in kl[:ci+1]], dtype=float)

            rsi_closed = ta.RSI(close_c, timeperiod=RSI_LEN)
            vol_ma_c   = sma_series(volume_c, VOL_SMA)

            last_close = float(close_c[-1])
            prev_close = float(close_c[-2]) if len(close_c) > 1 else last_close
            rsi_last_closed = float(rsi_closed[-1])
            rsi_prev_closed = float(rsi_closed[-2]) if len(rsi_closed) > 1 else None
            vol_last_closed = float(volume_c[-1])
            vol_sma_closed  = float(vol_ma_c[-1]) if not np.isnan(vol_ma_c[-1]) else 0.0

            # SR (son SR_LOOKBACK kapalı mum)
            look = slice(max(0, len(low_c)-SR_LOOKBACK), None)
            support    = float(np.nanmin(low_c[look]))
            resistance = float(np.nanmax(high_c[look]))
            rng = (resistance - support) if resistance > support else 0.0

            # --- Intrabar (kapanmamış 15m mumu) verileri ---
            full_close = np.array([float(x[4]) for x in kl], dtype=float)
            full_high  = np.array([float(x[2]) for x in kl], dtype=float)
            full_low   = np.array([float(x[3]) for x in kl], dtype=float)
            full_vol   = np.array([float(x[5]) for x in kl], dtype=float)
            rsi_full   = ta.RSI(full_close, timeperiod=RSI_LEN)

            rsi_intrabar = float(rsi_full[-1])          # kapanmamış 15m mum RSI
            high_intra   = float(full_high[-1])         # kapanmamış 15m mum HIGH
            low_intra    = float(full_low[-1])          # kapanmamış 15m mum LOW
            vol_intra    = float(full_vol[-1])          # kapanmamış 15m mum hacmi
            vol_ok_intra = (vol_sma_closed > 0 and vol_intra >= vol_mult * vol_sma_closed)

            # Kapalı mum HIGH/LOW'a göre radar yakınlık
            near_sup_closed    = (rng > 0 and low_c[-1]  <= support    + band_frac * rng)
            near_res_closed    = (rng > 0 and high_c[-1] >= resistance - BAND_FRAC * rng)

            # Intrabar HIGH/LOW'a göre radar yakınlık
            near_sup_intra     = (rng > 0 and low_intra  <= support    + band_frac * rng)
            near_res_intra     = (rng > 0 and high_intra >= resistance - BAND_FRAC * rng)

            # State init
            if symbol not in long_state:
                long_state[symbol]  = {"armed": False, "armed_ct": None}
            if symbol not in short_state:
                short_state[symbol] = {"armed": False, "armed_ct": None}

            # ------------- RADAR -------------
            if SCAN_MODE == "1m" and INTRABAR_RADAR:
                # Intrabar RADAR (kapanmamış 15m mumu)
                if (rsi_intrabar >= rsi_short_watch) and vol_ok_intra and near_res_intra and not short_state[symbol]["armed"]:
                    short_state[symbol]["armed"] = True
                    short_state[symbol]["armed_ct"] = int(kl[-1][6])  # intrabar 15m mumun closeTime'ı
                    print(f"[RADAR] {symbol} (intrabar) RSI {rsi_intrabar:.2f} ≥ 70 + Hacim + (High) Direnç yakın → SHORT watch")
                if (rsi_intrabar <= rsi_long_watch) and vol_ok_intra and near_sup_intra and not long_state[symbol]["armed"]:
                    long_state[symbol]["armed"] = True
                    long_state[symbol]["armed_ct"] = int(kl[-1][6])
                    print(f"[RADAR] {symbol} (intrabar) RSI {rsi_intrabar:.2f} ≤ 30 + Hacim + (Low) Destek yakın → LONG watch")
            else:
                # Kapalı mum RADAR
                vol_ok_closed = (vol_sma_closed > 0 and vol_last_closed >= vol_mult * vol_sma_closed)
                if (rsi_last_closed >= rsi_short_watch) and vol_ok_closed and near_res_closed and not short_state[symbol]["armed"]:
                    short_state[symbol]["armed"] = True
                    short_state[symbol]["armed_ct"] = cc_time
                    print(f"[RADAR] {symbol} (closed) RSI {rsi_last_closed:.2f} ≥ 70 + Hacim + (High) Direnç yakın → SHORT watch")
                if (rsi_last_closed <= rsi_long_watch) and vol_ok_closed and near_sup_closed and not long_state[symbol]["armed"]:
                    long_state[symbol]["armed"] = True
                    long_state[symbol]["armed_ct"] = cc_time
                    print(f"[RADAR] {symbol} (closed) RSI {rsi_last_closed:.2f} ≤ 30 + Hacim + (Low) Destek yakın → LONG watch")

            # ------------- ONAY & RADARDAN ÇIKARMA (yalnız kapalı 15m, bir SONRAKİ kapanışta) -------------
            # SHORT: sinyal bandı [60,70), altı disarm
            short_ready = short_state[symbol]["armed"] and (cc_time > (short_state[symbol]["armed_ct"] or 0))
            if short_ready:
                if rsi_last_closed < RSI_SHORT_BAND_LOW:
                    short_state[symbol] = {"armed": False, "armed_ct": None}
                    print(f"[RADAR-EXIT] {symbol} SHORT watch kapandı: RSI_closed {rsi_last_closed:.2f} < {RSI_SHORT_BAND_LOW:.0f}")
                elif (RSI_SHORT_BAND_LOW <= rsi_last_closed < RSI_SHORT_BAND_HIGH):
                    # Json_DataWriter({"satis_degeri": last_close, "zaman": str(Last_day), "sembol": symbol})
                    src = "intrabar" if (SCAN_MODE == "1m" and INTRABAR_RADAR) else "closed"
                    extra = [f"RADAR({src}): RSI≥70 + Hacim + (High) Direnç yakın",
                             f"ONAY(closed): {RSI_SHORT_BAND_LOW:.0f} ≤ RSI < {RSI_SHORT_BAND_HIGH:.0f}"]
                    print_reason(
                        side="sat", symbol=symbol, tf="15m", last_day=Last_day,
                        last_price=last_close, prev_price=prev_close, rsi_last=rsi_last_closed,
                        vol_last=vol_last_closed, vol_ma=vol_sma_closed,
                        support=support, resistance=resistance,
                        rsi_prev=rsi_prev_closed, extra_parts=extra
                    )
                    short_state[symbol] = {"armed": False, "armed_ct": None}
                else:
                    # RSI ≥ 70 → bekle (radarda kal)
                    pass

            # LONG: sinyal bandı (30,40], üstü disarm
            long_ready = long_state[symbol]["armed"] and (cc_time > (long_state[symbol]["armed_ct"] or 0))
            if long_ready:
                if rsi_last_closed > RSI_LONG_BAND_HIGH:
                    long_state[symbol] = {"armed": False, "armed_ct": None}
                    print(f"[RADAR-EXIT] {symbol} LONG watch kapandı: RSI_closed {rsi_last_closed:.2f} > {RSI_LONG_BAND_HIGH:.0f}")
                elif (RSI_LONG_BAND_LOW < rsi_last_closed <= RSI_LONG_BAND_HIGH):
                    # Json_DataWriter({"alis_degeri": last_close, "zaman": str(Last_day), "sembol": symbol})
                    src = "intrabar" if (SCAN_MODE == "1m" and INTRABAR_RADAR) else "closed"
                    extra = [f"RADAR({src}): RSI≤30 + Hacim + (Low) Destek yakın",
                             f"ONAY(closed): {RSI_LONG_BAND_LOW:.0f} < RSI ≤ {RSI_LONG_BAND_HIGH:.0f}"]
                    print_reason(
                    side="al", symbol=symbol, tf="15m", last_day=Last_day,
                    last_price=last_close, prev_price=prev_close, rsi_last=rsi_last_closed,
                    vol_last=vol_last_closed, vol_ma=vol_sma_closed,
                    support=support, resistance=resistance,
                    rsi_prev=rsi_prev_closed, extra_parts=extra
                    )
                    long_state[symbol] = {"armed": False, "armed_ct": None}
                else:
                    # RSI ≤ 30 → bekle (radarda kal)
                    pass

        except Exception as e:
            print(f"{symbol} işlenirken hata: {type(e).__name__}: {e}")
            traceback.print_exc(limit=1)

# ====== Zamanlama ======
def sleep_until_next_15m():
    now = datetime.utcnow()
    add_min = (15 - (now.minute % 15)) % 15
    if add_min == 0 and now.second == 0:
        return
    next_close = (now.replace(second=0, microsecond=0) + timedelta(minutes=add_min))
    sleep_s = (next_close - now).total_seconds()
    if sleep_s > 0:
        time.sleep(sleep_s + CLOSE_BUFFER_SEC)

def sleep_until_next_minute():
    now = datetime.utcnow()
    next_min = (now.replace(second=0, microsecond=0) + timedelta(minutes=1))
    sleep_s = (next_min - now).total_seconds()
    if sleep_s > 0:
        time.sleep(sleep_s + 0.3)  # küçük tampon

if __name__ == "__main__":
    try:
        ip_adress = http_get("https://api.ipify.org").text
        print("Web Soketlerine Bağlanıldı Ip Adresiniz: " + ip_adress)
    except Exception:
        pass

    cprint(figlet_format('HASS', font='epic'), 'white', attrs=['bold'])
    print(f"Tarama modu: {SCAN_MODE} | Intrabar RADAR: {INTRABAR_RADAR}")

    while True:
        if SCAN_MODE == "1m":
            sleep_until_next_minute()
        else:
            sleep_until_next_15m()
        try:
            scan_once()
        except Exception as e:
            print("Tarama hatası:", e)