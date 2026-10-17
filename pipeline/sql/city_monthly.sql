-- City-wide monthly series for Market Pulse (unfiltered default view).
-- Inputs: table sales_clean; variables data_end (date), last_full_month (date).
select
    strftime(month, '%Y-%m')                                          as month,
    count(*)                                                          as sales,
    sum(price)                                                        as value_aed,
    count(*) filter (where market = 'offplan')                        as sales_offplan,
    count(*) filter (where market = 'ready')                          as sales_ready,
    round(median(psf), 1)                                             as psf,
    round(median(psf) filter (where ptype = 'apartment'), 1)          as psf_apartment,
    round(median(psf) filter (where ptype = 'villa'), 1)              as psf_villa,
    round(median(psf) filter (where market = 'offplan'), 1)           as psf_offplan,
    round(median(psf) filter (where market = 'ready'), 1)             as psf_ready,
    month > getvariable('last_full_month')                            as partial
from sales_clean
where month >= date '2016-01-01'
group by month
order by month
