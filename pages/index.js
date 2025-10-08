import { useState } from 'react'
import Head from 'next/head'
import styles from '../styles/Home.module.css'

export default function Home() {
  const [pid, setPid] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [isError, setIsError] = useState(false)
  const [allReviews, setAllReviews] = useState([])
  const [extractedReviews, setExtractedReviews] = useState([])
  const [paginationInfo, setPaginationInfo] = useState(null)
  const [currentPage, setCurrentPage] = useState(0)

  const fetchReviews = async (pid, offset = 0, limit = 100) => {
    const baseUrl = 'https://api.bazaarvoice.com/data/reviews.json'
    const params = new URLSearchParams({
      'Filter': 'contentlocale:en*',
      'Filter': `ProductId:${pid}`,
      'Sort': 'SubmissionTime:desc',
      'Limit': limit.toString(),
      'Offset': offset.toString(),
      'Include': 'Products,Comments',
      'Stats': 'Reviews',
      'passkey': 'calXm2DyQVjcCy9agq85vmTJv5ELuuBCF2sdg4BnJzJus',
      'apiversion': '5.4',
      'Locale': 'en_US'
    })

    const response = await fetch(`${baseUrl}?${params}`, {
      method: 'GET',
      mode: 'cors',
    })

    if (!response.ok) {
      throw new Error(`Request failed with status: ${response.status} ${response.statusText}`)
    }

    return await response.json()
  }

  const extractReviewData = (reviews) => {
    return reviews.map(review => ({
      recommended: review.IsRecommended ? 'Yes' : 'No',
      rating: review.Rating || 'N/A',
      title: review.Title || 'No Title',
      reviewtext: review.ReviewText || 'No Review Text'
    }))
  }

  const exportToCSV = () => {
    if (extractedReviews.length === 0) return

    const headers = ['Recommended', 'Rating', 'Title', 'Review Text']
    const csvContent = [
      headers.join(','),
      ...extractedReviews.map(review => [
        `"${review.recommended}"`,
        `"${review.rating}"`,
        `"${review.title.replace(/"/g, '""')}"`,
        `"${review.reviewtext.replace(/"/g, '""')}"`
      ].join(','))
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `reviews_${pid}_${new Date().toISOString().split('T')[0]}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!pid.trim()) {
      setMessage('Please enter a Product ID to continue')
      setIsError(true)
      return
    }

    setLoading(true)
    setMessage('')
    setIsError(false)
    setAllReviews([])
    setExtractedReviews([])
    setPaginationInfo(null)
    setCurrentPage(0)

    try {
      let allReviewsData = []
      let offset = 0
      let limit = 100
      let totalResults = 0
      let currentPageNum = 0

      while (true) {
        setMessage(`Fetching page ${currentPageNum + 1}... (${allReviewsData.length} reviews collected so far)`)
        
        const data = await fetchReviews(pid.trim(), offset, limit)
        
        if (!data.Results || data.Results.length === 0) {
          break
        }

        allReviewsData = [...allReviewsData, ...data.Results]
        totalResults = data.TotalResults || totalResults
        currentPageNum++
        setCurrentPage(currentPageNum)

        // Update pagination info
        setPaginationInfo({
          totalResults,
          currentOffset: offset,
          currentLimit: limit,
          pagesFetched: currentPageNum
        })

        // If we've fetched all results, break
        if (allReviewsData.length >= totalResults) {
          break
        }

        offset += limit

        // Small delay to avoid overwhelming the API
        await new Promise(resolve => setTimeout(resolve, 100))
      }

      setAllReviews(allReviewsData)
      const extractedData = extractReviewData(allReviewsData)
      setExtractedReviews(extractedData)
      setMessage(`Successfully collected ${allReviewsData.length} reviews from ${currentPageNum} pages!`)
      setIsError(false)

    } catch (error) {
      setMessage(`Request failed: ${error.message}`)
      setIsError(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.container}>
      <Head>
        <title>Bazaarvoice Review Scraper</title>
        <meta name="description" content="Scrape reviews from Bazaarvoice API" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className={styles.main}>
        <div className={styles.formContainer}>
          <h1 className={styles.title}>Enter Product ID</h1>
          
          <form onSubmit={handleSubmit} className={styles.form}>
            <input
              type="text"
              value={pid}
              onChange={(e) => setPid(e.target.value)}
              placeholder="P511300"
              className={styles.input}
              disabled={loading}
            />
            <button 
              type="submit" 
              className={styles.button}
              disabled={loading}
            >
              {loading ? 'Scraping...' : 'Scrape Reviews'}
            </button>
          </form>

          {message && (
            <div className={`${styles.message} ${isError ? styles.error : ''}`}>
              {message}
            </div>
          )}

          {paginationInfo && (
            <div className={styles.paginationInfo}>
              <h3>Progress:</h3>
              <p><strong>Total Reviews:</strong> {paginationInfo.totalResults}</p>
              <p><strong>Pages Fetched:</strong> {paginationInfo.pagesFetched}</p>
              <p><strong>Reviews Collected:</strong> {allReviews.length}</p>
              {loading && (
                <div className={styles.progressBar}>
                  <div 
                    className={styles.progressFill}
                    style={{ width: `${(allReviews.length / paginationInfo.totalResults) * 100}%` }}
                  ></div>
                </div>
              )}
            </div>
          )}

          {extractedReviews.length > 0 && !loading && (
            <div className={styles.reviewsContainer}>
              <div className={styles.reviewsHeader}>
                <h3>Extracted Review Data ({extractedReviews.length} reviews)</h3>
                <button 
                  onClick={exportToCSV}
                  className={styles.exportButton}
                >
                  Export to CSV
                </button>
              </div>
              
              <div className={styles.tableContainer}>
                <table className={styles.reviewsTable}>
                  <thead>
                    <tr>
                      <th>Recommended</th>
                      <th>Rating</th>
                      <th>Title</th>
                      <th>Review Text</th>
                    </tr>
                  </thead>
                  <tbody>
                    {extractedReviews.map((review, index) => (
                      <tr key={index}>
                        <td className={styles.recommendedCell}>
                          <span className={`${styles.recommendedBadge} ${review.recommended === 'Yes' ? styles.recommendedYes : styles.recommendedNo}`}>
                            {review.recommended}
                          </span>
                        </td>
                        <td className={styles.ratingCell}>
                          <span className={styles.rating}>⭐ {review.rating}</span>
                        </td>
                        <td className={styles.titleCell}>{review.title}</td>
                        <td className={styles.textCell}>
                          {review.reviewtext.length > 150 
                            ? review.reviewtext.substring(0, 150) + '...'
                            : review.reviewtext
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
