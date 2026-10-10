"""
app/utils/regex_filter.py
─────────────────────────
Rule-based pre-filter that drops obvious OTP / security emails
*before* they reach the privacy SLM, saving API calls and latency.

Classes
  RegexEmailFilter — stateless helper; all methods are instance methods
                     so the class can be subclassed or mocked in tests.
"""

from __future__ import annotations

import re
from typing import Tuple


class RegexEmailFilter:
    """
    Fast regex-based gate for email classification.

    Call `should_drop()` as the entry point — it runs OTP detection first,
    then security-email detection, and returns a (drop_flag, reason) tuple.
    """

    # ── OTP patterns ──────────────────────────────────────────────────────────

    # Matches 4-8 consecutive digits that are the *main* content of the subject
    _OTP_SUBJECT_RE = re.compile(
        r"\b(?:otp|one[- ]time|verification|confirm(?:ation)?|"
        r"passcode|pin|security\s+code)[^:]*:\s*\d{4,8}\b"
        r"|\b\d{4,8}\s+(?:is\s+your|as\s+your)\b",
        re.IGNORECASE,
    )

    # Body patterns — "Your OTP is 123456", "Use 123456 to verify", etc.
    _OTP_BODY_RE = re.compile(
        r"\b(?:your\s+(?:otp|one[- ]time\s+(?:password|code)|"
        r"verification\s+code|passcode|pin)\s+(?:is|:)\s*\d{4,8})"
        r"|\buse\s+\d{4,8}\s+to\s+(?:verify|confirm|login|log\s+in)\b"
        r"|\b\d{4,8}\s+is\s+your\s+(?:otp|code|pin|passcode)\b"
        r"|\benter\s+(?:the\s+)?code\s+\d{4,8}\b",
        re.IGNORECASE,
    )

    # ── Security / transactional email patterns ───────────────────────────────

    # Subject keywords
    _SECURITY_SUBJECT_RE = re.compile(
        r"\b(?:password\s+reset|reset\s+your\s+password"
        r"|two[- ]factor|2fa\s+(?:enabled|code|setup)"
        r"|login\s+alert|sign[- ]in\s+attempt"
        r"|unusual\s+(?:sign[- ]in|activity|login)"
        r"|new\s+(?:sign[- ]in|device|login)"
        r"|account\s+(?:locked|suspended|recovery|alert|security)"
        r"|suspicious\s+(?:activity|login|sign[- ]in)"
        r"|verify\s+your\s+(?:email|identity|account)"
        r"|security\s+alert|unrecognized\s+(?:device|login))\b",
        re.IGNORECASE,
    )

    # Body keywords for security contexts
    _SECURITY_BODY_RE = re.compile(
        r"\b(?:reset\s+your\s+password|click\s+(?:here\s+)?to\s+reset"
        r"|forgot\s+(?:your\s+)?password"
        r"|enable\s+two[- ]factor|set\s+up\s+2fa"
        r"|we\s+(?:noticed|detected)\s+a\s+(?:new|suspicious|unusual)\s+(?:sign[- ]in|login|device)"
        r"|if\s+(?:you\s+)?(?:did\s+not|didn.t)\s+(?:request|make|do)\s+this"
        r"|your\s+account\s+(?:has\s+been|was)\s+(?:locked|suspended|compromised)"
        r"|unauthorized\s+access)\b",
        re.IGNORECASE,
    )

    # No-reply / security-style senders
    _SECURITY_SENDER_RE = re.compile(
        r"(?:no[_\-.]?reply"
        r"|noreply"
        r"|security"
        r"|alerts?"
        r"|notifications?"
        r"|accounts?-?"
        r"|auth(?:entication)?"
        r"|verify"
        r"|support"
        r"|donotreply"
        r"|do[_\-.]?not[_\-.]?reply"
        r")@",
        re.IGNORECASE,
    )

    # ── Public API ────────────────────────────────────────────────────────────

    def is_otp_email(self, subject: str, body: str) -> bool:
        """
        Return True when the email contains a one-time passcode / OTP.

        Checks both subject and body so that emails with OTPs hidden inside
        longer bodies are also caught.
        """
        subject = subject or ""
        body = body or ""

        if self._OTP_SUBJECT_RE.search(subject):
            return True
        if self._OTP_BODY_RE.search(body):
            return True

        # Fallback: standalone 4-8 digit block in subject that looks like a code
        bare_digits = re.search(r"(?<!\d)\d{4,8}(?!\d)", subject)
        if bare_digits and any(
            kw in subject.lower()
            for kw in ("code", "otp", "pin", "verify", "confirm", "token")
        ):
            return True

        return False

    def is_security_email(self, subject: str, body: str, sender: str) -> bool:
        """
        Return True when the email appears to be a security / transactional
        notification (password reset, 2FA, login alert, etc.).

        Checks subject keywords, body keywords, and sender address pattern.
        Any single match is sufficient to flag the email.
        """
        subject = subject or ""
        body = body or ""
        sender = sender or ""

        if self._SECURITY_SUBJECT_RE.search(subject):
            return True
        if self._SECURITY_BODY_RE.search(body):
            return True
        if self._SECURITY_SENDER_RE.search(sender):
            return True

        return False

    # ── Social / Marketing / Noise patterns ──────────────────────────────────

    _SOCIAL_SENDER_RE = re.compile(
        r"@(?:[^@\s]*\.)?(?:pinterest|linkedin|instagram|facebook|twitter|x|quora|medium|spotify|netflix|swiggy|zomato|uber)\.com?",
        re.IGNORECASE,
    )

    _NOISE_SUBJECT_RE = re.compile(
        r"\b(?:pins?\s+for\s+you|recommendations?\s+for\s+you"
        r"|a\s+scoop\s+of\s+feedback|feedback,\s*please|rate\s+your\s+experience"
        r"|take\s+our\s+survey|we\s+wanna\s+know\s+what\s+you\s+think"
        r"|so\s+on\s+point|pins?\s+you\s+might\s+like|digest\b"
        r"|trending\s+on|who\s+viewed\s+your\s+profile)\b",
        re.IGNORECASE,
    )

    def is_social_or_noise(self, subject: str, body: str, sender: str) -> bool:
        """Return True if the email is social media notifications, surveys, or marketing noise."""
        subject = subject or ""
        body = body or ""
        sender = sender or ""

        if self._SOCIAL_SENDER_RE.search(sender):
            return True
        if self._NOISE_SUBJECT_RE.search(subject):
            return True
        if "pinterest" in sender.lower() or "pinterest" in body.lower()[:300]:
            return True
        return False

    def should_drop(
        self,
        subject: str,
        body: str,
        sender: str,
    ) -> Tuple[bool, str]:
        """
        Combined gate.  Returns ``(True, reason)`` when the email should be
        discarded *before* reaching the privacy SLM, otherwise ``(False, "")``.

        Priority:
          1. OTP check   (highest priority — drop immediately)
          2. Security check
          3. Social / Noise check
        """
        if self.is_otp_email(subject, body):
            return True, "otp_email"

        if self.is_security_email(subject, body, sender):
            return True, "security_email"

        if self.is_social_or_noise(subject, body, sender):
            return True, "social_or_noise"

        return False, ""
