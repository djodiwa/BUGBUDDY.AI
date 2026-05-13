#!/usr/bin/env python3
"""Unit tests for ai_summarizer module."""

import json
import pytest
from unittest.mock import Mock, patch, MagicMock
from ai_summarizer import ScanSummarizer, Sanitizer, AIProvider, LogParser


class TestSanitizer:
    def test_sanitize_tool_names(self):
        sanitizer = Sanitizer()
        text = "Nmap found vulnerabilities in the network"
        result = sanitizer.sanitize(text)
        assert "[TOOL]" in result
        assert "Nmap" not in result

    def test_sanitize_log_files(self):
        sanitizer = Sanitizer()
        text = "Results from logs.json and scan_log_123.txt"
        result = sanitizer.sanitize(text)
        assert "logs.json" not in result
        assert "scan_log_123.txt" not in result
        assert "[TOOL]" in result


class TestLogParser:
    def test_parse_logs_empty(self):
        parser = LogParser()
        logs = []
        batches = parser.parse_logs(logs)
        assert batches == ["(no logs captured)"]

    def test_parse_logs_basic(self):
        parser = LogParser()
        logs = [
            {"timestamp": "2023-01-01", "tool": "test", "level": "info", "message": "Starting scan"}
        ]
        batches = parser.parse_logs(logs)
        assert len(batches) == 1
        assert "[2023-01-01]" in batches[0]

    def test_normalize_findings(self):
        parser = LogParser()
        findings = [
            {"severity": "high"},
            {"severity": "critical"},
            {"severity": "high"},
            {"severity": "low"}
        ]
        summary = parser.normalize_findings(findings)
        assert summary["count"] == 4
        assert summary["by_severity"]["critical"] == 1
        assert summary["by_severity"]["high"] == 2
        assert summary["by_severity"]["low"] == 1


class TestAIProvider:
    def test_normalize_endpoints_base_url(self):
        provider = AIProvider("https://api.example.com", "key", "model")
        endpoints = provider._normalize_endpoints()
        assert "https://api.example.com/v1/chat/completions" in endpoints
        assert "https://api.example.com/chat/completions" in endpoints

    def test_normalize_endpoints_already_complete(self):
        provider = AIProvider("https://api.example.com/chat/completions", "key", "model")
        endpoints = provider._normalize_endpoints()
        assert endpoints == ["https://api.example.com/chat/completions"]

    @patch('ai_summarizer.req.post')
    def test_call_chat_success(self, mock_post):
        mock_response = Mock()
        mock_response.ok = True
        mock_response.json.return_value = {
            "choices": [{"message": {"content": "Test response"}}]
        }
        mock_post.return_value = mock_response

        provider = AIProvider("https://api.example.com", "key", "model")
        result = provider.call_chat([{"role": "user", "content": "test"}])
        assert result == "Test response"


class TestScanSummarizer:
    @patch('ai_summarizer.get_ai_settings')
    @patch('ai_summarizer.get_scan_job')
    @patch('ai_summarizer.get_findings')
    @patch('ai_summarizer.get_scan_logs')
    def test_init_success(self, mock_logs, mock_findings, mock_job, mock_settings):
        mock_settings.return_value = {
            "endpoint": "https://api.example.com",
            "api_key": "test_key",
            "model": "gpt-4"
        }
        mock_job.return_value = {
            "user_id": "user1",
            "status": "completed"
        }

        summarizer = ScanSummarizer("user1", "scan1")
        assert summarizer.user_id == "user1"
        assert summarizer.scan_id == "scan1"

    @patch('ai_summarizer.get_ai_settings')
    def test_init_no_config(self, mock_settings):
        mock_settings.return_value = {"endpoint": "", "api_key": ""}

        with pytest.raises(RuntimeError, match="AI endpoint/api_key not configured"):
            ScanSummarizer("user1", "scan1")

    @patch('ai_summarizer.get_scan_job')
    @patch('ai_summarizer.get_ai_settings')
    def test_get_scan_data_not_completed(self, mock_settings, mock_job):
        mock_settings.return_value = {"endpoint": "https://api.example.com", "api_key": "key"}
        mock_job.return_value = {"user_id": "user1", "status": "running"}

        summarizer = ScanSummarizer("user1", "scan1")
        with pytest.raises(RuntimeError, match="scan not completed"):
            summarizer._get_scan_data()


if __name__ == "__main__":
    pytest.main([__file__])