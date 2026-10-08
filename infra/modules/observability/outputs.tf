output "alarm_topic_arn" {
  description = "SNS topic that every alarm and the budget publish to. Subscribe additional endpoints here."
  value       = aws_sns_topic.alarms.arn
}

output "budget_name" {
  value = aws_budgets_budget.monthly.name
}
