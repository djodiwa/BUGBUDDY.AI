#!/usr/bin/env python3
"""Integration test for ai_summarizer with mock data."""

import json
import tempfile
from unittest.mock import patch, MagicMock
from ai_summarizer import ScanSummarizer, summarize_scan_async


def test_full_summarization_flow():
    """Test the complete summarization flow with mocked AI."""

    # Mock scan data
    mock_job = {
        "id": "test_scan_123",
        "user_id": "test_user",
        "target": "example.com",
        "mode": "basic",
        "sensitivity": "normal",
        "tools": ["nmap", "nikto"],
        "status": "completed",
        "created_at": "2023-01-01T00:00:00Z",
        "finished_at": "2023-01-01T01:00:00Z"
    }

    mock_findings = [
        {"severity": "high", "title": "SQL Injection"},
        {"severity": "medium", "title": "Weak SSL"},
        {"severity": "low", "title": "Old software"}
    ]

    mock_logs = [
        {
            "timestamp": "2023-01-01T00:05:00Z",
            "tool": "nmap",
            "level": "info",
            "message": "Starting port scan on example.com"
        },
        {
            "timestamp": "2023-01-01T00:10:00Z",
            "tool": "nikto",
            "level": "warning",
            "message": "Found potential vulnerability"
        }
    ]

    # Mock AI response
    mock_ai_response = {
        "score": 75,
        "risk_level": "medium",
        "mission_summary": "Scan completed with moderate security posture",
        "what_happened": "Network scanning revealed several ports open and web vulnerabilities detected",
        "timeline": ["00:05 - Port scanning started", "00:10 - Web scanning found issues"],
        "notable_errors": ["Connection timeout to port 443"],
        "recommendations": ["Close unused ports", "Update SSL configuration"]
    }

    with patch('ai_summarizer.get_ai_settings') as mock_settings, \
         patch('ai_summarizer.get_scan_job') as mock_job_func, \
         patch('ai_summarizer.get_findings') as mock_findings_func, \
         patch('ai_summarizer.get_scan_logs') as mock_logs_func, \
         patch('ai_summarizer.AIProvider.call_chat') as mock_call_chat:

        # Setup mocks
        mock_settings.return_value = {
            "endpoint": "https://api.example.com",
            "api_key": "test_key",
            "model": "gpt-4"
        }
        mock_job_func.return_value = mock_job
        mock_findings_func.return_value = mock_findings
        mock_logs_func.return_value = mock_logs

        # Mock AI calls - only 2 calls: batch processing + final synthesis
        mock_call_chat.side_effect = [
            # Batch processing (only 1 batch)
            '{"state": {"timeline": ["00:05 - Port scanning started", "00:10 - Web scanning found issues"], "notable_events": ["Vulnerability found"], "errors": ["Connection timeout"], "tools_observed": ["nmap", "nikto"], "progress_signals": ["Scan progressing"]}, "batch_summary": "Scan completed", "batch_flags": {"had_errors": true, "had_tool_failures": false}}',
            # Final synthesis
            json.dumps(mock_ai_response)
        ]

        # Test summarization
        summarizer = ScanSummarizer("test_user", "test_scan_123")
        report = summarizer.generate_summary()

        # Debug: print report
        print("Report:", json.dumps(report, indent=2))

        # Verify report structure
        assert "score" in report
        assert "risk_level" in report
        assert "mission_summary" in report
        assert "timeline" in report
        assert isinstance(report["timeline"], list)
        assert isinstance(report["recommendations"], list)

        # Verify sanitization (no tool names in output)
        summary_text = report.get("mission_summary", "")
        assert "nmap" not in summary_text.lower()
        assert "nikto" not in summary_text.lower()

        # Verify score clamping
        assert 0 <= report["score"] <= 100

        print("✅ Full summarization flow test passed!")
        return report


def test_error_handling():
    """Test error handling when AI fails."""

    with patch('ai_summarizer.get_ai_settings') as mock_settings, \
         patch('ai_summarizer.get_scan_job') as mock_job_func, \
         patch('ai_summarizer.get_findings') as mock_findings_func, \
         patch('ai_summarizer.get_scan_logs') as mock_logs_func, \
         patch('ai_summarizer.AIProvider.call_chat') as mock_call_chat:

        # Setup mocks
        mock_settings.return_value = {
            "endpoint": "https://api.example.com",
            "api_key": "test_key",
            "model": "gpt-4"
        }
        mock_job_func.return_value = {
            "id": "test_scan_123",
            "user_id": "test_user",
            "target": "example.com",
            "mode": "basic",
            "sensitivity": "normal",
            "tools": ["nmap"],
            "status": "completed",
            "created_at": "2023-01-01T00:00:00Z",
            "finished_at": "2023-01-01T01:00:00Z"
        }
        mock_findings_func.return_value = [{"severity": "high"}]
        mock_logs_func.return_value = []

        # Mock AI failure for all calls
        mock_call_chat.side_effect = RuntimeError("AI provider unavailable")

        summarizer = ScanSummarizer("test_user", "test_scan_123")
        report = summarizer.generate_summary()

        # Debug
        print("Error test report:", json.dumps(report, indent=2))

        # Should have fallback report
        assert report.get("ai_error") == True
        assert "AI summarization failed" in report.get("mission_summary", "")
        assert report.get("score") == 50  # Default fallback score

        print("✅ Error handling test passed!")


if __name__ == "__main__":
    test_full_summarization_flow()
    test_error_handling()
    print("🎉 All integration tests passed!")